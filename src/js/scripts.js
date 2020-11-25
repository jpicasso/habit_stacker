// Search alert
$('.search button').click((e) => alert(`User typed ${$(e.target).prev().val()}`))

// Mega menu
$(document).on('click', '.megamenu__toggle', e => {
  let menu = $('.megamenu__menu'),
      body = $('body');

  menu.toggleClass('show');
  $(e.target).toggleClass('show');

  if (menu.hasClass('show')) { 
    saveScroll()
  } else { 
    returnScroll()
  }
});

window.addEventListener('scroll', () => {
  document.documentElement.style.setProperty('--scroll-y', window.scrollY);
});

// Save scroll when mega menu opens
const saveScroll = () => {
  const scrollY = document.documentElement.style.getPropertyValue('--scroll-y');
  const body = document.body;
  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
}

// Return scroll when mega menu closes
const returnScroll = () => {
  const body = document.body;
  const scrollY = body.style.top.split('px')[0];
  body.style.position = '';
  body.style.top = '';

  // Need a timer here or else it doesn't work ¯\_(ツ)_/¯
  window.setTimeout(() => {
    window.scrollTo(0, (scrollY * -1))
  }, 0.1)
}

// Active sidebar nav (https://css-tricks.com/sticky-smooth-active-nav/)
let mainNavLinks = document.querySelectorAll('.accordion ul li a');
let mainSections = document.querySelectorAll('.subsection');
let accTitles = $('.accordion .nav-link');
let lastId;
let cur = [];

window.addEventListener('scroll', event => {
  let fromTop = window.scrollY;
  accTitles.removeClass('active');

  mainNavLinks.forEach(link => {
    let section = document.querySelector(link.hash);

    if (section !== null) {
      if (section.offsetTop <= fromTop && section.offsetTop + section.offsetHeight > fromTop) {
        link.classList.add('active');
  
        // Add and open parent accordion
        let accParent = $(link).parents('.collapse')
        accParent.prev().addClass('active');
        accParent.collapse('show');
  
      } else {
        link.classList.remove('active');
      }
    }
  });
});

// Smooth scroll
$('.accordion ul li a').on('click', e => { 
  e.preventDefault();
  let sub = $(e.target).attr('href');
  
  $('html, body').animate({
    scrollTop: $(sub).offset().top
  }, 500);

  // Active class on accordion parent after opening event finishes (shown.bs.collapse)
  let parentAcc = $(e.target).parents('.collapse');
  parentAcc.on('shown.bs.collapse', () => {
    parentAcc.prev().addClass('active')
  })
});

// Homepage hero parallax  
$(window).on('scroll', () => {
  let scrollTop = $(window).scrollTop(),
      imgPos = scrollTop / 2 + 'px',
      hero = $('.header--homepage');

  hero.css('background-position-y', imgPos);
});