// ============================================================
// NINJA DIGITAL — INTERACTIONS
// ============================================================

document.getElementById('year').textContent = new Date().getFullYear();

// ---------- LOADER ----------
window.addEventListener('load', () => {
  setTimeout(() => {
    document.getElementById('loader').classList.add('done');
  }, 1100);
});
// Fallback in case load already fired
setTimeout(() => {
  const l = document.getElementById('loader');
  if (l) l.classList.add('done');
}, 2400);

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

form.addEventListener('submit', async (e) => {
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
