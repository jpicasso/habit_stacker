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

const saveScroll = () => {
  const scrollY = document.documentElement.style.getPropertyValue('--scroll-y');
  const body = document.body;
  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
}

const returnScroll = () => {
  const body = document.body;
  const scrollY = body.style.top.split('px')[0];
  body.style.position = '';
  body.style.top = '';

  window.setTimeout(() => {
    window.scrollTo(0, (scrollY * -1))
  }, 0.1)
}