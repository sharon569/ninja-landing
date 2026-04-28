// === שנה נוכחית ב-footer ===
document.getElementById('year').textContent = new Date().getFullYear();

// === Nav scroll effect ===
const nav = document.getElementById('nav');
const onScroll = () => {
  if (window.scrollY > 30) nav.classList.add('scrolled');
  else nav.classList.remove('scrolled');
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// === Burger menu ===
const burger = document.getElementById('burger');
const navLinks = document.querySelector('.nav-links');
burger.addEventListener('click', () => navLinks.classList.toggle('open'));
navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));

// === Reveal on scroll ===
const revealEls = document.querySelectorAll(
  '.service-card, .why-item, .step, .stat-card, .testi, .section-head, .hero-text > *, .contact-form, .contact-text, .cd, .strip'
);
revealEls.forEach(el => el.classList.add('reveal'));

const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });

revealEls.forEach(el => io.observe(el));

// === Counters ===
const counters = document.querySelectorAll('[data-count]');
const animateCounter = (el) => {
  const target = parseInt(el.dataset.count, 10);
  const suffix = el.querySelector('span') ? el.querySelector('span').textContent : '';
  const duration = 1800;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = Math.floor(target * eased);
    el.innerHTML = val + (suffix ? `<span>${suffix}</span>` : '');
    if (t < 1) requestAnimationFrame(tick);
    else el.innerHTML = target + (suffix ? `<span>${suffix}</span>` : '');
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

// === Tilt effect on service cards ===
document.querySelectorAll('[data-tilt]').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rotX = ((y - cy) / cy) * -4;
    const rotY = ((x - cx) / cx) * 4;
    card.style.transform = `translateY(-6px) perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;

    const glow = card.querySelector('.card-glow');
    if (glow) {
      glow.style.left = `${x - 150}px`;
      glow.style.top = `${y - 150}px`;
    }
  });
  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
  });
});

// === Form handling ===
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

// === Smooth scroll for in-page anchors (RTL safe) ===
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
