 // Mobile menu toggle
      (function () {
        const toggle = document.getElementById('menu-toggle');
        const header = document.querySelector('.site-header');
        const nav = document.getElementById('main-nav');

        function setExpanded(val) {
          toggle.setAttribute('aria-expanded', String(val));
          header.classList.toggle('nav-open', val);
        }

        toggle.addEventListener('click', function () {
          const expanded = toggle.getAttribute('aria-expanded') === 'true';
          setExpanded(!expanded);
        });

        // close mobile menu when a nav link is clicked
        nav.addEventListener('click', function (e) {
          if (e.target.tagName === 'A' && window.innerWidth <= 720) setExpanded(false);
        });

        // keep state in sync on resize
        window.addEventListener('resize', function () {
          if (window.innerWidth > 720) setExpanded(false);
        });
      })();

  // Header scroll: add subtle shadow when scrolled
  (function () {
    const header = document.querySelector('.site-header');
    if (!header) return;
    let last = 0;
    function onScroll() {
      const y = window.scrollY || window.pageYOffset;
      if (y > 24) header.classList.add('scrolled'); else header.classList.remove('scrolled');
      last = y;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  })();

  // Contact form handler removed (contact section is list-only per project requirement)

  // IntersectionObserver reveal for subtle entrance animations
  (function () {
    if (!('IntersectionObserver' in window)) return;

    const items = document.querySelectorAll('.reveal');
    if (!items.length) return;

    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        // apply revealed state
        el.classList.add('revealed');
        // stagger children if requested
        const children = el.querySelectorAll('.reveal[data-delay]');
        if (children.length) {
          children.forEach((c, i) => c.style.transitionDelay = (i * 80) + 'ms');
        }
        obs.unobserve(el);
      });
    }, { threshold: 0.12 });

    items.forEach(el => io.observe(el));
  })();

// Dynamic footer year
(function () {
  const y = new Date().getFullYear();
  const el = document.getElementById('year');
  if (el) el.textContent = y;
})();

// If contact mentions 'London', highlight LinkedIn and add group icon
(function () {
  const aside = document.querySelector('.contact-aside');
  if (!aside) return;
  const text = aside.textContent || '';
  if (text.toLowerCase().includes('london')) {
    const li = aside.querySelector('a[aria-label="LinkedIn"]');
    if (li) {
      li.classList.add('highlight');
      // append a group icon at the end
      const span = document.createElement('span');
      span.className = 'material-symbols-outlined';
      span.textContent = 'groups';
      li.appendChild(span);
    }
  }
})();