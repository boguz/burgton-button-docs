// Get Elements
const navElements = document.querySelectorAll('.nav__link');

// handle click on the menu items
const handleNavClick = (event) => {
  event.preventDefault();

  if (!event.target.classList.contains('nav__link--active')) {
    toggleNavClass(event.target)
    scrollToSection(event.target.getAttribute('href'))
  }
}

// Toggle the navigation active class
const toggleNavClass = (target) => {
  document.querySelector('.nav__link--active').classList.remove('nav__link--active');
  target.classList.add('nav__link--active');
}

// Smooth scroll to the correct section,
// accounting for the topbar height
const scrollToSection = (sectionID) => {
  const section = document.querySelector(sectionID);
  const y = section.getBoundingClientRect().top + window.pageYOffset - 96;
  window.scrollTo({top: y, behavior: 'smooth'});
}

// Event Listeners
navElements.forEach((navElement) => navElement.addEventListener('click', handleNavClick));
