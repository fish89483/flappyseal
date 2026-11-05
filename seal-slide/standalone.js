(() => {
  const game = SealSlide.create({ host: document.querySelector('#slide-host'), onExit: () => { location.href = '../'; } });
  game.showMenu();
})();
