// Search alert
$('.search button').click((e) => alert(`User typed ${$(e.target).prev().val()}`))

// Mega menu
$(document).on('click', '.megamenu__toggle', (e) => {
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

  window.setTimeout(() => {
    window.scrollTo(0, (scrollY * -1))
  }, 0.1)
}

// Tab links
$('#classes-tab').click(() => {window.location.href = '/index.html'})
$('#slides-tab').click(() => {window.location.href = '/coding101/slides.html'})
$('#projects-tab').click(() => {window.location.href = '/coding101/projects.html'})
$('#cheat-sheets-tab').click(() => {window.location.href = '/coding101/cheat-sheets.html'})