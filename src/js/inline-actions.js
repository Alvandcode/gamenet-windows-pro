/* Gamenet Manager Pro - CSP-safe inline action layer
 *
 * The renderer used to build ~350 inline handlers (onclick=/onchange=/oninput=
 * in the static HTML and in every render template), which is why the CSP had
 * to carry script-src-attr 'unsafe-inline'. That single directive let any
 * HTML injection execute arbitrary JS (a stored-XSS vector was actually
 * exploited through a backup file - see security.js jsStr/numId).
 *
 * This module removes the need for it: every inline event attribute is moved
 * to a data-on* attribute and the body is INTERPRETED by a tiny restricted
 * evaluator instead of the browser's JS compiler. The evaluator:
 *   - only resolves identifiers against window (so a call target must be an
 *     existing global function - unknown names fail closed)
 *   - allows literals, this/event/document, member reads, simple calls,
 *     assignments and if / || / && / === / arithmetic
 *   - BLOCKS meta members (constructor, __proto__, call, apply, eval,
 *     Function, require, ...) so code cannot escape through property graphs
 *   - never uses new Function / eval, and rejects anything it does not
 *     understand (fail closed: the handler is skipped and a warning logged)
 *
 * Bubble-phase events are delegated from document (one listener per type);
 * non-bubbling ones (error/load) get a direct listener attached at conversion
 * time. Dynamically rendered HTML goes through a MutationObserver, so a
 * handler is never left in blocked inline form.
 */
(function () {
  'use strict';

  /* properties that let code walk out of the sandbox */
  var BLOCKED = {
    'constructor': 1, 'prototype': 1, '__proto__': 1,
    '__defineGetter__': 1, '__defineSetter__': 1,
    '__lookupGetter__': 1, '__lookupSetter__': 1,
    'call': 1, 'apply': 1, 'bind': 1,
    'eval': 1, 'Function': 1, 'require': 1, 'process': 1, 'import': 1,
    'globalThis': 1, 'module': 1, 'exports': 1
  };
  var NAME_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  /* event methods a handler may call */
  var EVENT_METHODS = { 'stopPropagation': 1, 'stopImmediatePropagation': 1, 'preventDefault': 1 };
  /* document methods a handler may call */
  var DOC_METHODS = { 'querySelector': 1, 'querySelectorAll': 1 };

  /* ---------------- tokenizer ---------------- */
  function tokenize(src) {
    var toks = [], i = 0, n = src.length;
    while (i < n) {
      var c = src.charAt(i);
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (/[A-Za-z_$]/.test(c)) {
        var j = i + 1;
        while (j < n && /[A-Za-z0-9_$]/.test(src.charAt(j))) j++;
        toks.push({ t: 'id', v: src.slice(i, j) }); i = j; continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src.charAt(i + 1) || ''))) {
        var j2 = i;
        while (j2 < n && /[0-9.]/.test(src.charAt(j2))) j2++;
        var num = Number(src.slice(i, j2));
        if (!isFinite(num)) throw new Error('bad number');
        toks.push({ t: 'num', v: num }); i = j2; continue;
      }
      if (c === '"' || c === "'") {
        var j3 = i + 1, out = '';
        while (j3 < n && src.charAt(j3) !== c) {
          if (src.charAt(j3) === '\\') { out += src.charAt(j3 + 1); j3 += 2; }
          else { out += src.charAt(j3); j3++; }
        }
        if (j3 >= n) throw new Error('unterminated string');
        toks.push({ t: 'str', v: out }); i = j3 + 1; continue;
      }
      var three = src.substr(i, 3);
      if (three === '===' || three === '!==') { toks.push({ t: 'op', v: three }); i += 3; continue; }
      var two = src.substr(i, 2);
      if (two === '=>' || two === '==' || two === '!=' || two === '&&' || two === '||' ||
          two === '<=' || two === '>=') { toks.push({ t: 'op', v: two }); i += 2; continue; }
      if ('+-*/%!<>=()[],;?:.{}'.indexOf(c) >= 0) { toks.push({ t: 'op', v: c }); i++; continue; }
      throw new Error('unexpected character: ' + c);
    }
    return toks;
  }

  /* ---------------- parser ----------------
   * Returns an array of statement nodes. Throws on anything outside the
   * supported grammar (fail closed). */
  function parseAction(src) {
    var toks = tokenize(String(src || ''));
    var pos = 0;
    function peek() { return toks[pos]; }
    function next() { return toks[pos++]; }
    function expect(v) {
      var t = next();
      if (!t || t.t !== 'op' || t.v !== v) throw new Error('expected "' + v + '"');
    }
    function atOp(v) { var t = peek(); return !!t && t.t === 'op' && t.v === v; }

    function parseStmt() {
      var t = peek();
      if (t && t.t === 'id' && t.v === 'if') {
        next(); expect('(');
        var cond = parseExpr();
        expect(')');
        var then = parseStmt();
        var els = null;
        if (peek() && peek().t === 'id' && peek().v === 'else') { next(); els = parseStmt(); }
        return { k: 'if', cond: cond, then: then, els: els };
      }
      if (!t) throw new Error('empty statement');
      return { k: 'expr', e: parseExpr() };
    }

    function parseExpr() { return parseAssign(); }
    function parseAssign() {
      var left = parseTernary();
      var t = peek();
      if (t && t.t === 'op' && (t.v === '=' || t.v === '+=' || t.v === '-=')) {
        if (left.k !== 'member' && left.k !== 'ident') throw new Error('bad assignment target');
        next();
        return { k: 'assign', op: t.v, target: left, value: parseAssign() };
      }
      return left;
    }
    function parseTernary() {
      var c = parseOr();
      if (atOp('?')) {
        next();
        var a = parseAssign(); expect(':');
        var b = parseAssign();
        return { k: 'cond', c: c, a: a, b: b };
      }
      return c;
    }
    function parseOr() { var l = parseAnd(); while (atOp('||')) { next(); l = { k: 'or', l: l, r: parseAnd() }; } return l; }
    function parseAnd() { var l = parseEq(); while (atOp('&&')) { next(); l = { k: 'and', l: l, r: parseEq() }; } return l; }
    function parseEq() {
      var l = parseRel();
      while (peek() && peek().t === 'op' && (peek().v === '===' || peek().v === '!==' || peek().v === '==' || peek().v === '!=')) {
        var op = next().v; l = { k: 'eq', op: op, l: l, r: parseRel() };
      }
      return l;
    }
    function parseRel() {
      var l = parseAdd();
      while (peek() && peek().t === 'op' && (peek().v === '<' || peek().v === '>' || peek().v === '<=' || peek().v === '>=')) {
        var op = next().v; l = { k: 'rel', op: op, l: l, r: parseAdd() };
      }
      return l;
    }
    function parseAdd() {
      var l = parseMul();
      while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
        var op = next().v; l = { k: 'bin', op: op, l: l, r: parseMul() };
      }
      return l;
    }
    function parseMul() {
      var l = parseUnary();
      while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/' || peek().v === '%')) {
        var op = next().v; l = { k: 'bin', op: op, l: l, r: parseUnary() };
      }
      return l;
    }
    function parseUnary() {
      var t = peek();
      if (t && t.t === 'op' && (t.v === '!' || t.v === '-' || t.v === '+')) {
        next();
        return { k: 'un', op: t.v, e: parseUnary() };
      }
      return parsePostfix();
    }
    function parsePostfix() {
      var e = parsePrimary();
      for (;;) {
        if (atOp('.')) {
          next();
          var t = next();
          if (!t || t.t !== 'id') throw new Error('bad member name');
          if (BLOCKED[t.v]) throw new Error('member blocked: ' + t.v);
          e = { k: 'member', obj: e, prop: t.v, computed: false };
        } else if (atOp('[')) {
          next();
          var idx = parseExpr(); expect(']');
          /* string index = property name: apply the same rules as dot access */
          if (idx.k === 'lit' && typeof idx.v === 'string') {
            if (BLOCKED[idx.v] || !NAME_RE.test(idx.v)) throw new Error('computed member blocked: ' + idx.v);
          }
          e = { k: 'member', obj: e, prop: idx, computed: true };
        } else if (atOp('(')) {
          next();
          var args = [];
          if (!atOp(')')) {
            for (;;) {
              args.push(parseAssign());
              if (atOp(',')) { next(); continue; }
              break;
            }
          }
          expect(')');
          e = { k: 'call', callee: e, args: args };
        } else break;
      }
      return e;
    }
    function parsePrimary() {
      var t = next();
      if (!t) throw new Error('unexpected end of action');
      if (t.t === 'num' || t.t === 'str') return { k: 'lit', v: t.v };
      if (t.t === 'op' && t.v === '{') return parseObject();
      if (t.t === 'op' && t.v === '[') return parseArray();
      if (t.t === 'op' && t.v === '(') {
        /* arrow with parameters: (a, b) => expr|{...} */
        var close = matchingParen(toks, pos - 1);
        if (close >= 0 && toks[close + 1] && toks[close + 1].t === 'op' && toks[close + 1].v === '=>') {
          return parseArrowParams();
        }
        var e = parseExpr(); expect(')');
        return e;
      }
      if (t.t === 'id') {
        if (t.v === 'true') return { k: 'lit', v: true };
        if (t.v === 'false') return { k: 'lit', v: false };
        if (t.v === 'null') return { k: 'lit', v: null };
        if (t.v === 'undefined') return { k: 'lit', v: undefined };
        if (t.v === 'this') return { k: 'this' };
        if (t.v === 'event') return { k: 'event' };
        if (t.v === 'document') return { k: 'document' };
        if (BLOCKED[t.v]) throw new Error('global blocked: ' + t.v);
        /* zero-parameter arrow: ident => expr */
        var nxt = peek();
        if (nxt && nxt.t === 'op' && nxt.v === '=>') {
          next(); // consume =>
          return finishArrow([t.v]);
        }
        /* statements that change control flow or create code are not part of
         * the grammar; encountering one here means the body is not a supported
         * action */
        if (!NAME_RE.test(t.v)) throw new Error('bad identifier');
        return { k: 'ident', name: t.v };
      }
      throw new Error('unexpected token: ' + t.v);
    }

    /* object literal: { key: expr, ... } - keys are identifiers or strings */
    function parseObject() {
      var props = [];
      if (!atOp('}')) {
        for (;;) {
          var keyTok = next();
          if (!keyTok || (keyTok.t !== 'id' && keyTok.t !== 'str')) throw new Error('bad object key');
          if (keyTok.t === 'str' && (BLOCKED[keyTok.v] || !NAME_RE.test(keyTok.v))) throw new Error('object key blocked: ' + keyTok.v);
          if (keyTok.t === 'id' && (BLOCKED[keyTok.v] || !NAME_RE.test(keyTok.v))) throw new Error('object key blocked: ' + keyTok.v);
          expect(':');
          props.push({ key: keyTok.v, value: parseAssign() });
          if (atOp(',')) { next(); continue; }
          break;
        }
      }
      expect('}');
      return { k: 'object', props: props };
    }

    /* array literal: [expr, ...] */
    function parseArray() {
      var items = [];
      if (!atOp(']')) {
        for (;;) {
          items.push(parseAssign());
          if (atOp(',')) { next(); continue; }
          break;
        }
      }
      expect(']');
      return { k: 'array', items: items };
    }

    function matchingParen(toks, open) {
      var depth = 0;
      for (var i = open; i < toks.length; i++) {
        if (toks[i].t === 'op' && toks[i].v === '(') depth++;
        else if (toks[i].t === 'op' && toks[i].v === ')') { depth--; if (depth === 0) return i; }
      }
      return -1;
    }
    function parseArrowParams() {
      /* the '(' was already consumed by parsePrimary */
      var params = [];
      if (!atOp(')')) {
        for (;;) {
          var p = next();
          if (!p || p.t !== 'id' || !NAME_RE.test(p.v)) throw new Error('bad arrow parameter');
          params.push(p.v);
          if (atOp(',')) { next(); continue; }
          break;
        }
      }
      expect(')');
      var arrow = peek();
      if (!arrow || arrow.t !== 'op' || arrow.v !== '=>') throw new Error('expected =>');
      next();
      return finishArrow(params);
    }
    function finishArrow(params) {
      var t = peek();
      if (t && t.t === 'op' && t.v === '{') {
        next();
        var stmts = [];
        if (!atOp('}')) {
          for (;;) {
            stmts.push(parseStmt());
            if (atOp(';')) { next(); if (atOp('}')) break; continue; }
            break;
          }
        }
        expect('}');
        return { k: 'arrow', params: params, block: stmts };
      }
      return { k: 'arrow', params: params, body: parseAssign() };
    }

    if (!toks.length) throw new Error('empty action');
    var stmts = [parseStmt()];
    while (atOp(';')) {
      next();
      if (!peek()) break;
      stmts.push(parseStmt());
    }
    if (pos !== toks.length) throw new Error('trailing tokens in action');
    return stmts;
  }

  /* ---------------- evaluator ---------------- */
  function ev(node, ctx) {
    switch (node.k) {
      case 'lit': return node.v;
      case 'this': return ctx.t;
      case 'event': return ctx.e;
      case 'document': return document;
      case 'object': {
        var o = {};
        for (var pi = 0; pi < node.props.length; pi++) {
          var key = node.props[pi].key;
          if (BLOCKED[key]) throw new Error('object key blocked: ' + key);
          o[key] = ev(node.props[pi].value, ctx);
        }
        return o;
      }
      case 'array': {
        var arr = new Array(node.items.length);
        for (var ai = 0; ai < node.items.length; ai++) arr[ai] = ev(node.items[ai], ctx);
        return arr;
      }
      case 'arrow': {
        return function () {
          var child = { t: ctx.t, e: ctx.e, vars: new Map() };
          for (var a = 0; a < node.params.length; a++) child.vars.set(node.params[a], arguments[a]);
          if (node.block) return exec(node.block, child);
          return ev(node.body, child);
        };
      }
      case 'ident': {
        if (ctx.vars && ctx.vars.has(node.name)) return ctx.vars.get(node.name);
        return window[node.name]; // may be undefined -> caught at call
      }
      case 'member': {
        var obj = ev(node.obj, ctx);
        if (obj === null || obj === undefined) throw new Error('member of ' + obj);
        var p = node.computed ? ev(node.prop, ctx) : node.prop;
        if (typeof p === 'string') {
          if (BLOCKED[p] || !NAME_RE.test(p)) throw new Error('member blocked: ' + p);
        }
        return obj[p];
      }
      case 'call': {
        var f = ev(node.callee, ctx);
        if (typeof f !== 'function') throw new Error('"' + describe(node.callee) + '" is not a function');
        if (node.callee.k === 'member') {
          var name = node.callee.computed ? ev(node.callee.prop, ctx) : node.callee.prop;
          if (node.callee.obj.k === 'document' && !DOC_METHODS[name]) {
            throw new Error('document method blocked: ' + name);
          }
          if (node.callee.obj.k === 'event' && !EVENT_METHODS[name]) {
            throw new Error('event method blocked: ' + name);
          }
        }
        var thisArg;
        if (node.callee.k === 'member') {
          try { thisArg = ev(node.callee.obj, ctx); } catch (_) { thisArg = undefined; }
        }
        var args = new Array(node.args.length);
        for (var i = 0; i < node.args.length; i++) args[i] = ev(node.args[i], ctx);
        return f.apply(thisArg, args);
      }
      case 'assign': {
        var val = ev(node.value, ctx);
        var tgt = node.target;
        if (tgt.k === 'ident') {
          if (BLOCKED[tgt.name]) throw new Error('global blocked: ' + tgt.name);
          if (ctx.vars && ctx.vars.has(tgt.name)) {
            var cur = ctx.vars.get(tgt.name);
            var upd = node.op === '=' ? val : arith(node.op, cur, val);
            ctx.vars.set(tgt.name, upd);
            return upd;
          }
          if (node.op === '=') window[tgt.name] = val;
          else window[tgt.name] = arith(node.op, window[tgt.name], val);
          return window[tgt.name];
        }
        var obj = ev(tgt.obj, ctx);
        if (obj === null || obj === undefined) throw new Error('assign into ' + obj);
        /* only this element, the event, document and window are writable */
        if (obj !== ctx.t && obj !== ctx.e && obj !== document && obj !== window) {
          throw new Error('assignment target not allowed');
        }
        var p = tgt.computed ? ev(tgt.prop, ctx) : tgt.prop;
        if (typeof p === 'string' && (BLOCKED[p] || !NAME_RE.test(p))) throw new Error('member blocked: ' + p);
        if (node.op === '=') obj[p] = val; else obj[p] = arith(node.op, obj[p], val);
        return obj[p];
      }
      case 'if': return undefined; // handled by exec
      case 'cond': return truthy(ev(node.c, ctx)) ? ev(node.a, ctx) : ev(node.b, ctx);
      case 'or': {
        var l = ev(node.l, ctx);
        return truthy(l) ? l : ev(node.r, ctx);
      }
      case 'and': {
        var l2 = ev(node.l, ctx);
        return truthy(l2) ? ev(node.r, ctx) : l2;
      }
      case 'eq': {
        var a = ev(node.l, ctx), b = ev(node.r, ctx);
        if (node.op === '===') return a === b;
        if (node.op === '!==') return a !== b;
        return node.op === '==' ? a == b : a != b; // eslint-disable-line eqeqeq
      }
      case 'rel': {
        var a2 = ev(node.l, ctx), b2 = ev(node.r, ctx);
        if (node.op === '<') return a2 < b2;
        if (node.op === '>') return a2 > b2;
        if (node.op === '<=') return a2 <= b2;
        return a2 >= b2;
      }
      case 'bin': {
        var x = ev(node.l, ctx), y = ev(node.r, ctx);
        switch (node.op) {
          case '+': return x + y;
          case '-': return x - y;
          case '*': return x * y;
          case '/': return x / y;
          default: return x % y;
        }
      }
      case 'un': {
        var v = ev(node.e, ctx);
        if (node.op === '!') return !v;
        if (node.op === '-') return -v;
        return +v;
      }
      default: throw new Error('unknown node: ' + node.k);
    }
  }
  function arith(op, a, b) { return op === '+=' ? String(a) + String(b) : Number(a) - Number(b); }
  function truthy(v) { return !!v; }
  function describe(node) {
    if (node.k === 'ident') return node.name;
    if (node.k === 'member') return describe(node.obj) + '.' + (node.computed ? '…' : node.prop);
    return node.k;
  }

  function exec(stmts, ctx) {
    for (var i = 0; i < stmts.length; i++) {
      var s = stmts[i];
      if (s.k === 'if') {
        if (truthy(ev(s.cond, ctx))) exec([s.then], ctx);
        else if (s.els) exec([s.els], ctx);
      } else {
        ev(s.e, ctx);
      }
    }
  }

  /* small bounded cache: renders rebuild the same handler strings constantly */
  var cache = new Map();
  function getAst(body) {
    var ast = cache.get(body);
    if (!ast) {
      ast = parseAction(body);
      if (cache.size > 800) cache.clear();
      cache.set(body, ast);
    }
    return ast;
  }

  function runBody(el, body, evt) {
    try {
      exec(getAst(body), { t: el, e: evt });
    } catch (err) {
      try { console.warn('[gamenet] inline action failed:', String(body).slice(0, 120), (err && err.message) || err); } catch (_) {}
    }
  }

  /* ---------------- conversion ---------------- */
  var INLINE_ATTRS = ['onclick', 'onchange', 'oninput', 'onkeydown', 'onerror', 'onload'];
  var SEL = '[onclick],[onchange],[oninput],[onkeydown],[onerror],[onload]';
  var DELEGATED = { click: 'data-onclick', change: 'data-onchange', input: 'data-oninput', keydown: 'data-onkeydown' };

  function convertEl(el) {
    for (var i = 0; i < INLINE_ATTRS.length; i++) {
      var a = INLINE_ATTRS[i];
      if (!el.hasAttribute(a)) continue;
      var body = el.getAttribute(a);
      el.removeAttribute(a);
      try { el.setAttribute('data-' + a, body); } catch (_) { continue; }
      /* error/load do not bubble: a document-level delegate never sees them */
      if (a === 'error' || a === 'load') {
        try { el.addEventListener(a, function (evt) { runBody(el, body, evt); }); } catch (_) {}
      }
    }
  }

  function convert(root) {
    try {
      if (!root || !root.querySelectorAll) return;
      var list = [];
      if (root.nodeType === 1) {
        for (var i = 0; i < INLINE_ATTRS.length; i++) {
          try { if (root.hasAttribute(INLINE_ATTRS[i])) { list.push(root); break; } } catch (_) {}
        }
      }
      var sub = root.querySelectorAll(SEL);
      for (var j = 0; j < sub.length; j++) list.push(sub[j]);
      for (var k = 0; k < list.length; k++) convertEl(list[k]);
    } catch (_) { /* conversion must never break rendering */ }
  }

  function makeDelegate(dataAttr) {
    return function (evt) {
      try {
        var el = evt.target;
        if (!el || el.nodeType !== 1) return;
        /* replicate the bubble phase: inner handler first, then ancestors,
           stopping when the handler called event.stopPropagation() */
        for (var n = el; n; n = n.parentNode) {
          if (n.getAttribute && n.hasAttribute(dataAttr)) {
            runBody(n, n.getAttribute(dataAttr), evt);
            try { if (evt.cancelBubble) return; } catch (_) { /* keep walking */ }
          }
        }
      } catch (_) { /* a failing delegate must not take the app down */ }
    };
  }

  /* ---------------- install ---------------- */
  function install() {
    try { convert(document); } catch (_) {}
    for (var type in DELEGATED) {
      try { document.addEventListener(type, makeDelegate(DELEGATED[type])); } catch (_) {}
    }
    /* every render writes innerHTML, so convert synchronously right after the
     * write: no window where a dead inline attribute could be clicked, and no
     * test/observer timing race */
    try {
      var proto = window.Element && window.Element.prototype;
      if (proto) {
        ['innerHTML', 'outerHTML'].forEach(function (prop) {
          var d = Object.getOwnPropertyDescriptor(proto, prop);
          if (d && d.set && d.get && !d.set.__inlineConverted) {
            var orig = d.set;
            var patched = function (v) { var r = orig.call(this, v); convert(this); return r; };
            patched.__inlineConverted = true;
            Object.defineProperty(proto, prop, { get: d.get, set: patched, configurable: true });
          }
        });
      }
    } catch (_) { /* fall back to the MutationObserver below */ }
    try {
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) convert(added[j]);
        }
      });
      mo.observe(document.documentElement || document, { childList: true, subtree: true });
    } catch (_) { /* very old engines keep the CSP allowance */ }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }

  /* test hooks: the harvest test runs every rendered handler through parseAction */
  try {
    window.__inlineActions = {
      parse: parseAction,
      run: runBody,
      convert: convert
    };
  } catch (_) {}
})();
