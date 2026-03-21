/**
 * DOMContentLoaded entry: delegates to focused init modules in this folder.
 */
document.addEventListener('DOMContentLoaded', async () => {
  await goalsDomInitBootstrap();
  await goalsDomInitStopwatch();
  goalsDomInitWorkingAndCaloriesForms();
  goalsDomInitGoalsTableUi();
});
