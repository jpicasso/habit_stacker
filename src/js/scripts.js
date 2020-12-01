// Search alert
$('.search button').click((e) => alert(`User typed ${$(e.target).prev().val()}`))

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
    let section = $(link.hash);

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

// Dropdown
$(document).on('click', '.dropdown-menu', (e) => {
  e.stopPropagation();
});

// Drawer
var mainNav = $('#mainNav');
var drawerBtn = $('#mainNavTrigger');

drawerBtn.on('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  mainNav.toggleClass('show');
  $('body').toggleClass('offcanvas-active');
  $('.screen-overlay').toggleClass('show');
}); 

$('.btn-close, .screen-overlay').click(e => {
  $('.screen-overlay').removeClass('show');
  mainNav.removeClass('show');
  $('body').removeClass('offcanvas-active');
}); 