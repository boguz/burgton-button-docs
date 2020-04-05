const navElements = document.querySelectorAll('.nav__clickable');

const handleNavClick = (event) => {
  if (!event.target.classList.contains('nav__clickable--active')) {
    document.querySelector('.nav__clickable--active').classList.remove('nav__clickable--active');
    event.target.classList.add('nav__clickable--active');
  }
}

navElements.forEach((navElement) => navElement.addEventListener('click', handleNavClick));
