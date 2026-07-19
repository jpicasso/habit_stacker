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

  // console.log(fromTop);

  mainNavLinks.forEach((link, i) => {
    let section = $(link.hash);

    if (section.length > 0) {

      if (i == 2) {
        console.log(`From top: ${fromTop}`);
        console.log(`between ${section[0].offsetTop} and ${section[0].offsetTop + section[0].offsetHeight}`);
      }

      if (
        section[0].offsetTop - 65 <= fromTop && 
        section[0].offsetTop + section[0].offsetHeight >= fromTop
      ) {
        link.classList.add('active');
  
        // Add and open parent accordion
        let accParent = $(link).parents('.collapse');
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
  // e.preventDefault();
  let sub = $(e.target).attr('href').split('.html')[1];
  
  $('html, body').animate({
    scrollTop: $(sub).offset().top - 50
  }, 500);

  // Active class on accordion parent after opening event finishes (shown.bs.collapse)
  // let parentAcc = $(e.target).parents('.collapse');
  // parentAcc.on('shown.bs.collapse', () => {
  //   parentAcc.prev().addClass('active')
  // })
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


// Project apps
$('a.project').on('click', e => {
  e.preventDefault();
  let url = e.target.href;
  window.open(url, 'Habit Stacker app', 'directories=no,titlebar=no,toolbar=no,location=no,status=no,menubar=no,scrollbars=no,resizable=no,width=960,height=500');
})