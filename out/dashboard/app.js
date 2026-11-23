(function(){
  'use strict';
  var D = window.RADAR;
  if (!D) return;
  var a = document.getElementById('board'),
    S = {q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null};
  var U = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0});
  function fU(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return U.format(n);
  }
  function fP(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fA(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  }
  function impliedOf(row, md) {
    var g = Math.min(md.growth_cap, Math.max(md.growth_floor, row.g === null ? 0 : row.g)),
      gM = 1 + (g / 100) * md.growth_weight,
      a = row.a === null ? md.unknown_age_days : row.a,
      aM = 1 + (Math.min(Math.max(a, 0), 1095) / 365) * md.age_weight,
      cC = Math.max(1, (row.h || []).length),
      cM = 1 + Math.min(cC - 1, 5) * md.chain_weight,
      tS = Math.pow(Math.max(1, row.t), md.tvl_power);
    return Math.max(1, Math.round(tS * Math.max(0.01, row.cm) * gM * aM * cM));
  }
  function el(t, A) {
    var n = document.createElement(t);
    if (A) {
      Object.keys(A).forEach(function(k) {
        if (k === 'class') n.className = A[k];
        else if (k === 'text') n.textContent = A[k];
        else if (k === 'html') n.innerHTML = A[k];
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), A[k]);
        else if (A[k] !== null && A[k] !== undefined) n.setAttribute(k, A[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function(x) {
        if (x) n.appendChild(x);
      });
      else if (typeof c === 'string') n.appendChild(document.createTextNode(c));
      else n.appendChild(c);
    }
    return n;
  }
  function cO(p) {
    return p.h && p.h.length > 0 ? p.h[0] : 'its main chain';
  }
  function cF(p) {
    if (p.t >= 5e9) return 250;
    if (p.t >= 1e9) return 150;
    if (p.t >= 1e8) return 100;
    return 50;
  }
  function hD(a) {
    if (a === null || a === undefined) return 30;
    if (a < 180) return 60;
    if (a < 365) return 45;
    return 30;
  }
  function aF(p, c, ch) {
    var t = (p.c || '').toLowerCase(),
      n = p.n;
    if (t.indexOf('lend') >= 0 || t.indexOf('cdp') >= 0 || t.indexOf('collateral') >= 0) return 'Supply $' + c + ' of USDC to ' + n + ' on ' + ch + ' and keep the position open.';
    if (t.indexOf('dex') >= 0 || t.indexOf('yield') >= 0 || t.indexOf('leveraged farm') >= 0) return 'Provide $' + c + ' of liquidity to ' + n + "'s main pool on " + ch + ' and keep the position open.';
    if (t.indexOf('bridge') >= 0) return 'Bridge $' + c + ' of USDC to ' + ch + ' through ' + n + ' and use the bridged funds in its app.';
    if (t.indexOf('staking') >= 0 || t.indexOf('restak') >= 0) return "Stake $" + c + " of the chain's staking asset through " + n + ' and keep the receipt.';
    if (t.indexOf('perpetual') >= 0 || t.indexOf('derivative') >= 0) return 'Deposit $' + c + ' of USDC as margin on ' + n + ' and open one small hedge.';
    if (t.indexOf('prediction') >= 0) return 'Fund $' + c + ' and place one market position on ' + n + '.';
    if (t.indexOf('curator') >= 0 || t.indexOf('allocator') >= 0) return 'Deposit $' + c + ' into a ' + n + ' vault on ' + ch + ' and keep the shares.';
    if (t.indexOf('stable') >= 0) return 'Mint or deposit $' + c + ' of the stable asset through ' + n + ' on ' + ch + '.';
    if (t.indexOf('rwa') >= 0) return "Mint $" + c + " of the protocol's yield asset on " + ch + ' and hold it.';
    if (t.indexOf('insurance') >= 0) return 'Buy $' + c + ' of cover from ' + n + ' on ' + ch + ' and keep the policy.';
    return 'Deposit $' + c + ' of USDC into ' + n + ' on ' + ch + ' and keep the position open.';
  }
  function fS(p) {
    var ch = cO(p),
      c = cF(p),
      h = hD(p.a),
      bE = Math.max(10, Math.round(p.t * 0.0002 + (p.a || 100) * 0.5)),
      aC = aF(p, c, ch),
      cS = p.h && p.h.length > 0 ? p.h.slice(0, 3).join(', ') : ch,
      cands = [{
        text: 'Access ' + p.n + ' app on ' + ch + ' to execute primary position: ' + aC,
        cost: '$' + c + ' capital + $' + (c >= 150 ? 8 : 4) + ' gas',
        time: '15 minutes',
        ev: bE * 1.5,
        cV: c + (c >= 150 ? 8 : 4),
        tV: 15
      }, {
        text: 'Participate in official Galxe campaigns and Zealy community quests for ' + p.n + ' to maximize tier multiplier allocation.',
        cost: '$2 gas fee',
        time: '20 minutes',
        ev: bE * 1.2,
        cV: 2,
        tV: 20
      }, {
        text: 'Utilize ' + p.n + ' cross-chain bridge and liquidity router across supported networks (' + cS + ').',
        cost: '$5 bridge fee',
        time: '15 minutes',
        ev: bE * 1.1,
        cV: 5,
        tV: 15
      }, {
        text: 'Stake LP receipt tokens or native assets into ' + p.n + ' secondary yield pools on ' + ch + ' for compounding rewards.',
        cost: '$' + Math.round(c * 0.5) + ' liquidity + $3 gas',
        time: '10 minutes',
        ev: bE * 1.0,
        cV: Math.round(c * 0.5) + 3,
        tV: 10
      }, {
        text: 'Set up a fresh non-custodial wallet dedicated exclusively to farming ' + p.n + ' with isolated offline seed storage.',
        cost: 'under $3 gas for setup',
        time: '5 minutes',
        ev: bE * 0.8,
        cV: 3,
        tV: 5
      }, {
        text: 'Perform routine weekly on-chain touchpoints on ' + p.n + ' (swaps, borrows, or governance votes) to maintain active user rank.',
        cost: '$2 weekly gas',
        time: '10 minutes',
        ev: bE * 0.9,
        cV: 2,
        tV: 10
      }, {
        text: 'Maintain active liquidity position in ' + p.n + ' for at least ' + h + ' consecutive days across multiple reporting snapshots.',
        cost: '$' + c + ' position maintenance',
        time: h + ' days',
        ev: bE * 1.3,
        cV: c,
        tV: h * 24
      }, {
        text: 'Log all transactional timestamps and review official ' + p.n + ' reward claim portals only via verified links before unwinding.',
        cost: 'zero fee (never pay to claim)',
        time: '5 minutes',
        ev: bE * 0.7,
        cV: 0,
        tV: 5
      }];
    cands.forEach(function(x) {
      x.sc = x.ev / (Math.max(1, x.cV) + x.tV);
    });
    cands.sort(function(a, b) {
      if (b.sc !== a.sc) return b.sc - a.sc;
      return a.text < b.text ? -1 : 1;
    });
    return cands.slice(0, 6).map(function(x) {
      return x.text + ' Cost: ' + x.cost + '. Time: ' + x.time + '.';
    });
  }
  function rH() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var p = new URLSearchParams(h);
    if (p.get('q')) S.q = p.get('q');
    if (p.get('p')) S.selected = p.get('p');
    if (p.get('category')) S.category = p.get('category');
  }
  function wH() {
    var p = new URLSearchParams();
    if (S.q) p.set('q', S.q);
    if (S.category !== 'all') p.set('category', S.category);
    if (S.selected) p.set('p', S.selected);
    var n = p.toString();
    if (n) window.history.replaceState(null, '', '#' + n);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  function r() {
    var q = S.q.trim().toLowerCase();
    return D.rs.filter(function(r) {
      if (S.category !== 'all' && r.c !== S.category) return false;
      if (!q) return true;
      return [r.n, r.s, r.c, (r.h || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sR(l) {
    return l.slice().sort(function(a, b) {
      var av, bv, k = S.sort;
      if (k === 'name') {
        av = a.n.toLowerCase();
        bv = b.n.toLowerCase();
      } else if (k === 'tvl') {
        av = a.t;
        bv = b.t;
      } else if (k === 'growth') {
        av = a.g === null ? -Infinity : a.g;
        bv = b.g === null ? -Infinity : b.g;
      } else if (k === 'age') {
        av = a.a === null ? Infinity : a.a;
        bv = b.a === null ? Infinity : b.a;
      } else {
        av = a.i;
        bv = b.i;
      }
      if (av < bv) return -S.dir;
      if (av > bv) return S.dir;
      return a.s < b.s ? -1 : 1;
    });
  }
  function hd() {
    return el('header', {class: 'top'},
      el('div', {class: 'brand'}, el('span', {class: 'mark'}), el('span', {class: 'brand-name', text: 'Token Radar'})),
      el('div', {class: 'top-meta'}, el('span', {text: 'Snapshot ' + D.as}), el('span', {text: 'DefiLlama protocol index'}), el('span', {text: D.mv + ' model'}))
    );
  }
  function le() {
    return el('section', {class: 'lede'},
      el('div', null, el('h1', {text: D.ws + ' watchlist protocols, ranked by implied value'}), el('p', {text: 'The watchlist is the floor: every protocol with at least $' + Math.round(D.fl / 1e6) + 'M of TVL and no token on record. The early radar adds ' + D.es + ' pre-token protocols below that floor. Implied value is a model, not a promise.'})),
      el('div', {class: 'facts'},
        el('div', {class: 'fact'}, el('span', {text: 'Watchlist covered'}), el('b', {text: D.ws + ' / ' + D.ws})),
        el('div', {class: 'fact'}, el('span', {text: 'Pre-token rows scored'}), el('b', {text: String(D.bs)})),
        el('div', {class: 'fact'}, el('span', {text: 'Early rows below the floor'}), el('b', {text: String(D.es)})),
        el('div', {class: 'fact'}, el('span', {text: 'Live-token protocols set aside'}), el('b', {text: String(D.ls)}))
      )
    );
  }
  function ct() {
    var cats = Array.from(new Set(D.rs.map(function(r) {
      return r.c || 'Other';
    }))).sort(),
      q = el('input', {type: 'search', id: 'q', placeholder: 'Search', value: S.q});
    q.addEventListener('input', function() {
      S.q = q.value;
      wH();
      ren();
    });
    var sel = el('select', {id: 'category'},
      el('option', {value: 'all', text: 'All'}),
      cats.map(function(c) {
        return el('option', {value: c, text: c, selected: c === S.category ? 'selected' : null});
      })
    );
    sel.addEventListener('change', function() {
      S.category = sel.value;
      wH();
      ren();
    });
    var pre = el('button', {type: 'button', 'aria-pressed': S.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function() {
        S.tab = 'pre-token';
        ren();
      }}),
      live = el('button', {type: 'button', 'aria-pressed': S.tab === 'live' ? 'true' : 'false', text: 'Live', onclick: function() {
        S.tab = 'live';
        ren();
      }});
    return el('div', {class: 'controls'},
      el('div', {class: 'field'}, el('label', {for: 'q', text: 'Search'}), q),
      el('div', {class: 'field'}, el('label', {for: 'category', text: 'Category'}), sel),
      el('div', {class: 'field'}, el('span', {class: 'sub', text: 'Token'}), el('div', {class: 'tabs'}, pre, live))
    );
  }
  function sH(k, l) {
    return el('th', {scope: 'col'}, el('button', {type: 'button', onclick: function() {
      if (S.sort === k) S.dir = -S.dir;
      else {
        S.sort = k;
        S.dir = -1;
      }
      ren();
    }}, l, S.sort === k ? el('span', {'aria-hidden': 'true', text: S.dir < 0 ? ' v' : ' ^'}) : null));
  }
  function bT() {
    var l = sR(r());
    if (l.length === 0) return el('div', {class: 'panel'}, el('div', {class: 'empty'}, el('h2', {text: 'No protocol'}), el('button', {class: 'button primary', type: 'button', text: 'Clear', onclick: function() {
        S.q = '';
        S.category = 'all';
        wH();
        ren();
      }})));
    var max = l[0].i || 1,
      tb = el('tbody');
    l.forEach(function(r, i) {
      var g = r.g === null ? 'n/a' : fP(r.g),
        gc = r.g === null ? '' : r.g >= 0 ? 'pos' : 'neg';
      tb.appendChild(el('tr', {'data-selected': S.selected === r.s ? 'true' : 'false', onclick: function() {
          oD(r.s);
        }},
        el('td', {class: 'num', text: String(i + 1)}),
        el('td', null, el('div', {class: 'name'}, el('b', {text: r.n}), el('span', {class: 'sub', text: (r.c || 'Other') + ' on ' + (r.h && r.h.length ? r.h.slice(0, 2).join(', ') : 'an unnamed chain')}))),
        el('td', {class: 'num', text: fU(r.t)}),
        el('td', {class: 'num ' + gc, text: g}),
        el('td', {class: 'num', text: fA(r.a)}),
        el('td', null, el('div', {class: 'implied'},
          el('div', {class: 'bar', 'aria-hidden': 'true'}, el('i', {style: 'width:' + Math.max(3, Math.round(r.i / max * 100)) + '%'})),
          el('span', {class: 'num', text: fU(r.i)})
        )),
        el('td', null, el('span', {class: 'status', text: 'no token'}))
      ));
    });
    return el('div', {class: 'panel'}, el('div', {class: 'table-wrap'}, el('table', null, el('thead', null, el('tr', null, sH('implied', 'Rank'), sH('name', 'Protocol'), sH('tvl', 'TVL'), sH('growth', '7d'), sH('age', 'Age'), sH('implied', 'Value'), el('th', {scope: 'col', text: 'Token'}))), tb)));
  }
  function lT() {
    var tb = el('tbody');
    D.lv.forEach(function(r) {
      tb.appendChild(el('tr', null,
        el('td', {class: 'num', text: 'live'}),
        el('td', null, el('div', {class: 'name'}, el('b', {text: r.n}), el('span', {class: 'sub', text: (r.c || 'Other') + ' on ' + (r.h && r.h.length ? r.h.slice(0, 2).join(', ') : 'an unnamed chain')}))),
        el('td', {class: 'num', text: fU(r.t)}),
        el('td', {class: 'num ' + (r.g !== null && r.g >= 0 ? 'pos' : 'neg'), text: fP(r.g)}),
        el('td', {class: 'num', text: fU(r.m)}),
        el('td', null, el('span', {class: 'status', text: 'already trades'}))
      ));
    });
    return el('div', {class: 'panel'}, el('div', {class: 'table-wrap'}, el('table', null, el('thead', null, el('tr', null, el('th', {scope: 'col', text: 'Status'}), el('th', {scope: 'col', text: 'Protocol'}), el('th', {scope: 'col', text: 'TVL'}), el('th', {scope: 'col', text: '7d'}), el('th', {scope: 'col', text: 'Mcap'}), el('th', {scope: 'col', text: 'Token'}))), tb)));
  }
  function mP() {
    var m = D.md;
    var h2 = el('h2', {text: 'How'});
    var p1 = el('p', {class: 'sub', text: 'Scored by one function.'});
    var div = el('div', {class: 'formula', text: 'implied value = TVL^' + m.tvl_power + ' x category multiple x growth multiplier x age multiplier x chain breadth multiplier'});
    var p2 = el('p', {class: 'sub', text: 'md: growth_weight=' + m.growth_weight + ', growth_floor=' + m.growth_floor + ', growth_cap=' + m.growth_cap + ', age_weight=' + m.age_weight + ', chain_weight=' + m.chain_weight + ', tvl_power=' + m.tvl_power + ', fallback_multiple=' + m.fallback_multiple + ', unknown_age_days=' + m.unknown_age_days});
    return el('section', {class: 'panel model'}, h2, p1, div, p2);
  }
  var d = el('dialog', {class: 'detail', id: 'detail'});
  d.addEventListener('close', function() {
    S.selected = null;
    wH();
  });
  function oD(s) {
    var r = D.rs.filter(function(x) {
      return x.s === s;
    })[0];
    if (!r) return;
    S.selected = s;
    wH();
    d.textContent = '';
    var steps = fS(r),
      m = D.md,
      g = Math.min(m.growth_cap, Math.max(m.growth_floor, r.g === null ? 0 : r.g)),
      gM = 1 + (g / 100) * m.growth_weight,
      a = r.a === null ? m.unknown_age_days : r.a,
      aM = 1 + (Math.min(Math.max(a, 0), 1095) / 365) * m.age_weight;
    d.appendChild(el('div', {class: 'detail-head'}, el('div', null, el('h2', {text: r.n})), el('button', {class: 'close', type: 'button', text: 'Close', onclick: function() {
        d.close();
      }})));
    d.appendChild(el('section', {class: 'detail-section'}, el('h3', {text: 'Value'}), el('div', {class: 'equation'},
      el('div', null, el('span', {text: 'TVL'}), el('b', {class: 'num', text: fU(r.t)})),
      el('div', null, el('span', {text: 'Growth'}), el('b', {class: 'num', text: fP(r.g)})),
      el('div', null, el('span', {text: 'Age'}), el('b', {class: 'num', text: fA(r.a)})),
      el('div', null, el('span', {text: 'G-Mult'}), el('b', {class: 'num', text: String(gM.toFixed(4))})),
      el('div', null, el('span', {text: 'A-Mult'}), el('b', {class: 'num', text: String(aM.toFixed(4))})),
      el('div', null, el('span', {text: 'Value'}), el('b', {class: 'num', text: fU(r.i)}))
    )));
    d.appendChild(el('section', {class: 'detail-section'}, el('h3', {text: 'Farm'}), el('ol', {class: 'steps'}, steps.map(function(s) {
      return el('li', null, el('b', {text: s}));
    }))));
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
  }
  function ren() {
    a.textContent = '';
    var sh = el('div', {class: 'shell'});
    sh.appendChild(hd());
    sh.appendChild(le());
    sh.appendChild(ct());
    sh.appendChild(S.tab === 'pre-token' ? bT() : lT());
    if (S.tab === 'pre-token') sh.appendChild(mP());
    a.appendChild(sh);
    if (!d.isConnected) a.appendChild(d);
    if (S.selected) oD(S.selected);
  }
  rH();
  ren();
  window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && d.open) d.close();
  });
})();
