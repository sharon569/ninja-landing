// ============================================================
// NINJA DIGITAL — INTERACTIONS
// ============================================================

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ---------- LOADER (only on first visit per session) ----------
const _loaderEl = document.getElementById('loader');
const _loaderShown = (() => { try { return sessionStorage.getItem('ninjaLoaderShown'); } catch { return null; } })();
if (_loaderShown && _loaderEl) {
  _loaderEl.classList.add('done');
} else {
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (_loaderEl) _loaderEl.classList.add('done');
      try { sessionStorage.setItem('ninjaLoaderShown', '1'); } catch {}
    }, 1100);
  });
  setTimeout(() => {
    if (_loaderEl) _loaderEl.classList.add('done');
    try { sessionStorage.setItem('ninjaLoaderShown', '1'); } catch {}
  }, 2400);
}

// ---------- CUSTOM CURSOR ----------
const cursorDot = document.getElementById('cursorDot');
const cursorRing = document.getElementById('cursorRing');
let mouseX = 0, mouseY = 0;
let ringX = 0, ringY = 0;

if (window.matchMedia('(pointer: fine)').matches) {
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    cursorDot.style.transform = `translate(${mouseX - 3}px, ${mouseY - 3}px)`;
  });

  // Ring follows with delay
  const animateRing = () => {
    ringX += (mouseX - ringX) * 0.18;
    ringY += (mouseY - ringY) * 0.18;
    cursorRing.style.transform = `translate(${ringX - 18}px, ${ringY - 18}px)`;
    requestAnimationFrame(animateRing);
  };
  animateRing();

  // Hover states
  document.querySelectorAll('a, button, [data-cursor], summary, input, textarea, select').forEach(el => {
    el.addEventListener('mouseenter', () => {
      cursorDot.classList.add('active');
      cursorRing.classList.add('active');
    });
    el.addEventListener('mouseleave', () => {
      cursorDot.classList.remove('active');
      cursorRing.classList.remove('active');
    });
  });

  // Hide on leaving viewport
  document.addEventListener('mouseleave', () => {
    cursorDot.style.opacity = '0';
    cursorRing.style.opacity = '0';
  });
  document.addEventListener('mouseenter', () => {
    cursorDot.style.opacity = '1';
    cursorRing.style.opacity = '1';
  });
}

// ---------- SCROLL PROGRESS BAR ----------
const scrollProgress = document.getElementById('scrollProgress');
const updateScrollProgress = () => {
  const h = document.documentElement;
  const scrolled = h.scrollTop / (h.scrollHeight - h.clientHeight);
  scrollProgress.style.width = (scrolled * 100) + '%';
};
window.addEventListener('scroll', updateScrollProgress, { passive: true });

// ---------- NAV SCROLL EFFECT ----------
const nav = document.getElementById('nav');
const onScroll = () => {
  if (window.scrollY > 30) nav.classList.add('scrolled');
  else nav.classList.remove('scrolled');
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ---------- BURGER MENU ----------
const burger = document.getElementById('burger');
const navLinks = document.getElementById('navLinks');
burger.addEventListener('click', () => navLinks.classList.toggle('open'));
navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));

// ---------- REVEAL ON SCROLL ----------
const revealEls = document.querySelectorAll('[data-reveal]');
const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });
revealEls.forEach(el => io.observe(el));

// Auto-reveal certain elements that aren't tagged
document.querySelectorAll('.service-card, .why-item, .stat-card, .testi, .ts-cat, .price-card, .bento-card, .vt-step, .faq-item, .cd').forEach(el => {
  if (!el.hasAttribute('data-reveal')) {
    el.setAttribute('data-reveal', '');
    el.classList.add(...[]);
    io.observe(el);
  }
});

// ---------- COUNTERS ----------
const counters = document.querySelectorAll('[data-count]');
const animateCounter = (el) => {
  const target = parseFloat(el.dataset.count);
  const suffix = el.dataset.suffix || (el.querySelector('span') ? el.querySelector('span').textContent : '');
  const isDecimal = el.dataset.suffix === '.';
  const duration = 1800;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    let val = target * eased;
    let display;
    if (isDecimal) {
      display = (val / 10).toFixed(1);
      el.innerHTML = `<span class="post">×</span>${display}`;
    } else if (suffix) {
      display = Math.floor(val);
      el.innerHTML = display + `<span>${suffix}</span>`;
    } else {
      display = Math.floor(val);
      el.innerHTML = display;
    }
    if (t < 1) requestAnimationFrame(tick);
    else {
      if (isDecimal) {
        el.innerHTML = `<span class="post">×</span>${(target / 10).toFixed(1)}`;
      } else if (suffix) {
        el.innerHTML = target + `<span>${suffix}</span>`;
      } else {
        el.innerHTML = target;
      }
    }
  };
  requestAnimationFrame(tick);
};
const counterIO = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCounter(entry.target);
      counterIO.unobserve(entry.target);
    }
  });
}, { threshold: 0.4 });
counters.forEach(c => counterIO.observe(c));

// ---------- TILT CARDS ----------
document.querySelectorAll('[data-tilt]').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rotX = ((y - cy) / cy) * -4;
    const rotY = ((x - cx) / cx) * 4;
    card.style.transform = `translateY(-6px) perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;

    const glow = card.querySelector('.card-glow, .bento-glow');
    if (glow) {
      glow.style.left = `${x - 200}px`;
      glow.style.top = `${y - 200}px`;
    }
  });
  card.addEventListener('mouseleave', () => { card.style.transform = ''; });
});

// ---------- MAGNETIC BUTTONS ----------
document.querySelectorAll('[data-magnetic]').forEach(btn => {
  btn.addEventListener('mousemove', (e) => {
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2 - 3}px)`;
  });
  btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
});

// ---------- HERO PARALLAX (mouse tracking) ----------
const heroVisual = document.getElementById('heroVisual');
if (heroVisual) {
  const hero = document.getElementById('hero');
  const parallaxItems = heroVisual.querySelectorAll('[data-parallax]');
  const shuriken = heroVisual.querySelector('.hero-shuriken');

  hero.addEventListener('mousemove', (e) => {
    const rect = hero.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
    const y = (e.clientY - rect.top - rect.height / 2) / rect.height;

    parallaxItems.forEach(item => {
      const speed = parseFloat(item.dataset.parallax) || 0.05;
      const offsetX = x * 60 * speed * 5;
      const offsetY = y * 60 * speed * 5;
      item.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    });

    if (shuriken) {
      shuriken.style.transform = `translate(${x * 20}px, ${y * 20}px)`;
    }
  });

  hero.addEventListener('mouseleave', () => {
    parallaxItems.forEach(item => { item.style.transform = ''; });
    if (shuriken) shuriken.style.transform = '';
  });
}

// ---------- HERO PARTICLES ----------
const particlesContainer = document.getElementById('heroParticles');
if (particlesContainer) {
  const particleCount = 30;
  for (let i = 0; i < particleCount; i++) {
    const p = document.createElement('span');
    p.style.left = Math.random() * 100 + '%';
    p.style.bottom = '-20px';
    p.style.setProperty('--dur', (8 + Math.random() * 12) + 's');
    p.style.animationDelay = Math.random() * 12 + 's';
    p.style.opacity = (0.3 + Math.random() * 0.5);
    if (Math.random() > 0.6) p.style.background = 'var(--red)';
    particlesContainer.appendChild(p);
  }
}

// ---------- VERTICAL TIMELINE PROGRESS ----------
const vtFill = document.getElementById('vtFill');
const updateVtFill = () => {
  if (!vtFill) return;
  const timeline = vtFill.closest('.vtimeline');
  if (!timeline) return;
  const rect = timeline.getBoundingClientRect();
  const winH = window.innerHeight;
  const top = rect.top;
  const height = rect.height;
  // Progress: 0 when timeline-top is at 70% of viewport, 1 when timeline-bottom is at 30%
  const start = winH * 0.7;
  const end = winH * 0.3;
  const totalDistance = height + start - end;
  const traveled = start - top;
  const progress = Math.max(0, Math.min(1, traveled / totalDistance));
  vtFill.style.height = (progress * 100) + '%';
};
window.addEventListener('scroll', updateVtFill, { passive: true });
window.addEventListener('resize', updateVtFill);
updateVtFill();

// ---------- FAQ — only one open at a time ----------
document.querySelectorAll('.faq-item').forEach(item => {
  item.addEventListener('toggle', () => {
    if (item.open) {
      document.querySelectorAll('.faq-item').forEach(other => {
        if (other !== item && other.open) other.open = false;
      });
    }
  });
});

// ---------- FORM HANDLING ----------
const form = document.getElementById('leadForm');
const status = document.getElementById('formStatus');

if (form) form.addEventListener('submit', async (e) => {
  e.preventDefault();
  status.className = 'form-status';
  status.textContent = '';

  const name = form.name.value.trim();
  const phone = form.phone.value.trim();

  if (!name || name.length < 2) {
    status.classList.add('err');
    status.textContent = 'שם מלא נדרש';
    return;
  }

  const phoneClean = phone.replace(/[\s\-]/g, '');
  if (!/^0\d{8,9}$/.test(phoneClean)) {
    status.classList.add('err');
    status.textContent = 'טלפון לא תקין (לדוגמה: 050-0000000)';
    return;
  }

  const btn = form.querySelector('button[type="submit"]');
  const original = btn.textContent;
  btn.textContent = 'שולח...';
  btn.disabled = true;

  try {
    const res = await fetch(form.action, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: new FormData(form)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success === 'true' || data.success === true)) {
      status.classList.add('ok');
      status.textContent = '✓ קיבלנו! נחזור אליך תוך 24 שעות.';
      form.reset();
    } else {
      status.classList.add('err');
      status.textContent = 'שליחה נכשלה. נסה שוב או חייג 054-582-2451.';
    }
  } catch (err) {
    status.classList.add('err');
    status.textContent = 'שליחה נכשלה. בדוק חיבור אינטרנט.';
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
});

// ---------- SMOOTH SCROLL ----------
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length > 1) {
      const target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        const top = target.getBoundingClientRect().top + window.scrollY - 70;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }
  });
});

// ============================================================
// NINJA SPLIT EFFECT — click a heading, it slices in 2 halves
// ============================================================
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;

  function splitHeading(e) {
    const el = e.currentTarget;
    if (el.classList.contains('ninja-cutting')) return;

    e.preventDefault();
    e.stopPropagation();
    el.classList.add('ninja-cutting');

    // Make container positioned for absolute children
    const cs = getComputedStyle(el);
    if (cs.position === 'static') el.style.position = 'relative';

    // Cards (multi-element + background) need a different cloning strategy
    const isCard = el.classList.contains('metric-card') || el.hasAttribute('data-ninja-cut-card');

    let top, bot;
    const line = document.createElement('span');
    line.className = 'ninja-slice-line';

    if (isCard) {
      // Deep-clone the whole card so background, layout & sparklines are preserved
      top = el.cloneNode(true);
      bot = el.cloneNode(true);
      top.className = 'ninja-card-clone ninja-card-clone-top';
      bot.className = 'ninja-card-clone ninja-card-clone-bot';
      // Remove any leftover nested clone artefacts
      top.querySelectorAll('.ninja-card-clone, .ninja-half, .ninja-slice-line').forEach(n => n.remove());
      bot.querySelectorAll('.ninja-card-clone, .ninja-half, .ninja-slice-line').forEach(n => n.remove());
    } else {
      const inner = el.innerHTML;
      top = document.createElement('span');
      bot = document.createElement('span');
      top.className = 'ninja-half ninja-half-top';
      bot.className = 'ninja-half ninja-half-bot';
      top.innerHTML = inner;
      bot.innerHTML = inner;
    }

    el.appendChild(top);
    el.appendChild(bot);
    el.appendChild(line);

    // Hide original content but keep dimensions
    el.classList.add('ninja-hide-text');

    setTimeout(() => {
      top.remove();
      bot.remove();
      line.remove();
      el.classList.remove('ninja-cutting', 'ninja-hide-text');
    }, 700);
  }

  function bind() {
    const selector = '.page-hero h1, .section-head h2, .hero-title, .metric-card, [data-ninja-cut]';
    document.querySelectorAll(selector).forEach(el => {
      if (el.dataset.ninjaBound) return;
      el.dataset.ninjaBound = '1';
      el.style.cursor = 'pointer';
      el.addEventListener('click', splitHeading);
    });
  }

  bind();
})();

// ============================================================
// KATANA SECTION DIVIDERS — draws once when section enters view
// ============================================================
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;

  const skip = ['hero', 'strip'];

  document.querySelectorAll('main > section, body > section').forEach((sec, i) => {
    if (i === 0) return;
    if (sec.id && skip.includes(sec.id)) return;

    // Ensure section is positioned (so absolute child anchors correctly)
    const cs = getComputedStyle(sec);
    if (cs.position === 'static') sec.style.position = 'relative';

    // Insert real div at top of section (NOT a pseudo-element — avoids conflicts)
    const line = document.createElement('div');
    line.className = 'katana-line';
    sec.insertBefore(line, sec.firstChild);
  });

  const katanaIO = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('slashed');
        katanaIO.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5, rootMargin: '-80px 0px -20% 0px' });

  document.querySelectorAll('.katana-line').forEach(l => katanaIO.observe(l));
})();

// ============================================================
// SHURIKEN STORM EASTER EGG — click logo 5x
// ============================================================
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;

  const logo = document.querySelector('.nav .logo');
  if (!logo) return;

  // === Persist click count across page navigations via sessionStorage ===
  const KEY = 'ninjaLogoClicks';
  const TIMEKEY = 'ninjaLogoLastClick';
  const TRIGGER = 'ninjaTriggerStorm';
  const WINDOW_MS = 1500;

  // Check if storm should fire on this page load
  if (sessionStorage.getItem(TRIGGER) === '1') {
    sessionStorage.removeItem(TRIGGER);
    setTimeout(() => triggerShurikenStorm(), 250);
  }

  // ========== Friendly first-visit hint ==========
  const HINT_SHOWN = 'ninjaHintShown';
  const HINT_DISMISSED = 'ninjaHintDismissed';

  function showHint() {
    if (sessionStorage.getItem(HINT_DISMISSED) === '1') return;
    if (sessionStorage.getItem(HINT_SHOWN) === '1') return;
    sessionStorage.setItem(HINT_SHOWN, '1');

    const hint = document.createElement('div');
    hint.className = 'egg-hint';
    hint.innerHTML = `
      <span class="eg-icon">🥷</span>
      <span class="eg-text">טיפ: לחץ <b>5 פעמים על הלוגו</b> וגלה משהו מגניב</span>
      <span class="eg-close" aria-label="סגור">×</span>
    `;
    document.body.appendChild(hint);
    requestAnimationFrame(() => hint.classList.add('show'));

    function dismiss() {
      hint.classList.remove('show');
      sessionStorage.setItem(HINT_DISMISSED, '1');
      setTimeout(() => hint.remove(), 320);
    }

    hint.querySelector('.eg-close').addEventListener('click', (ev) => {
      ev.stopPropagation();
      dismiss();
    });
    hint.addEventListener('click', () => {
      // Clicking the bubble itself counts as a logo click trigger toward storm
      logo.click();
    });
    setTimeout(dismiss, 9000);

    // Also dismiss when user clicks the logo anywhere
    logo.addEventListener('click', dismiss, { once: true });
  }

  // Show after 3.5 seconds (only on first visit per session, only on home page to avoid spam)
  setTimeout(showHint, 3500);

  logo.addEventListener('click', () => {
    const now = Date.now();
    const last = parseInt(sessionStorage.getItem(TIMEKEY) || '0', 10);
    let count = parseInt(sessionStorage.getItem(KEY) || '0', 10);

    // If too long since last click, reset
    if (now - last > WINDOW_MS) count = 0;
    count++;

    sessionStorage.setItem(KEY, String(count));
    sessionStorage.setItem(TIMEKEY, String(now));

    if (count >= 5) {
      sessionStorage.setItem(TRIGGER, '1');
      sessionStorage.setItem(KEY, '0');
    }
    // Don't preventDefault — let navigation happen normally.
    // The storm will fire on the next page load if triggered.
  });

  const SHURIKEN_SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
    <defs>
      <linearGradient id="es-r" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#ff2a3c"/>
        <stop offset="1" stop-color="#8b0000"/>
      </linearGradient>
    </defs>
    <path d="M32 4 L38 26 L60 32 L38 38 L32 60 L26 38 L4 32 L26 26 Z" fill="url(#es-r)" stroke="#ffd166" stroke-width="2"/>
    <circle cx="32" cy="32" r="4" fill="#0a0a0a" stroke="#ffd166" stroke-width="1"/>
  </svg>`;

  function triggerShurikenStorm() {
    // Vignette
    const vignette = document.createElement('div');
    vignette.className = 'shuriken-vignette';
    document.body.appendChild(vignette);
    setTimeout(() => vignette.remove(), 2500);

    // Toast
    const toast = document.createElement('div');
    toast.className = 'ninja-toast';
    toast.textContent = '🥷 NINJA MODE ACTIVATED';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);

    // 35 flying shurikens
    for (let i = 0; i < 35; i++) {
      setTimeout(() => spawnFlyingShuriken(), i * 25);
    }

    // Console message for the curious
    console.log('%c🥷 NINJA MODE — you found the secret!',
      'background: #ff2a3c; color: #ffd166; font-weight: 900; padding: 8px 16px; border-radius: 6px; font-size: 14px;');
  }

  function spawnFlyingShuriken() {
    const s = document.createElement('div');
    s.className = 'flying-shuriken-projectile';
    s.innerHTML = SHURIKEN_SVG;

    const fromLeft = Math.random() > 0.5;
    const startY = Math.random() * 90;
    const endY = Math.random() * 90;
    const size = 24 + Math.random() * 28;
    const dur = 900 + Math.random() * 700;
    const spins = (Math.random() > 0.5 ? 1 : -1) * (3 + Math.random() * 4);

    s.style.width = size + 'px';
    s.style.height = size + 'px';
    s.style.top = startY + 'vh';
    s.style[fromLeft ? 'left' : 'right'] = '-15%';

    document.body.appendChild(s);

    s.animate(
      [
        { transform: `translate(0, 0) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${fromLeft ? '120vw' : '-120vw'}, ${endY - startY}vh) rotate(${spins * 360}deg)`, opacity: 0.85 }
      ],
      { duration: dur, easing: 'cubic-bezier(.4,0,.65,1)', fill: 'forwards' }
    );

    setTimeout(() => s.remove(), dur + 100);
  }
})();
