const gulp = require('gulp');
const sass = require('gulp-sass');
const panini = require('panini');
const browserSync = require('browser-sync').create();


function style() { // Combine and process SCSS, output to /dist/css
  return gulp.src('src/scss/main.scss')
  .pipe(sass(
    {outputStyle: 'compressed'} // minify CSS
  ).on('error',sass.logError))
  .pipe(gulp.dest('dist/css'))
  .pipe(browserSync.stream());
}


function resetPages() { // This is supposed to refresh changes to /partials and /layouts, but it's broken in Gulp 4.x, so let's just output a sad message instead
  console.log('Unfortunately, you have to reset when changes are made to layouts and partials :(')
  // return async () => { await panini.refresh() }
  // panini.refresh();
}

function copyImages() { // Copy the img folder and its subfolders to /dist
  return gulp.src(['./src/img/**/*'])
    .pipe(gulp.dest('dist/img'));
}

function copyJs() { // Copy the js folder and its subfolders to /dist
  return gulp.src(['./src/js/**/*'])
    .pipe(gulp.dest('dist/js'));
}

function copyHabitsPageJs() { // Habit Stacker page script (lives next to source HTML in src/pages)
  return gulp.src('./src/pages/habits.js')
    .pipe(gulp.dest('dist'));
}

function copySounds() { // Copy the sounds folder and its subfolders to /dist
  return gulp.src(['./src/sounds/**/*'])
    .pipe(gulp.dest('dist/sounds'));
}

function compileHtml() { // Compile panini templates and output to /dist
  return gulp.src('./src/pages/**/*.html')
    .pipe(panini({
      root: './src/pages/',
      layouts: './src/layouts/',
      partials: './src/partials/'
    }))
    .pipe(gulp.dest('dist'));
}

function startup() { // Run all the tasks (occurs once when gulp watch starts up)
  style();
  // resetPages();
  compileHtml();
  copyImages();
  copyJs();
  copyHabitsPageJs();
  copySounds();
}

function watch() { // Run startup tasks, init browserSync and watch for changes to all project files
  startup();
  browserSync.init({
    proxy: "http://localhost:3000", // Proxy to Express server
    port: 3001, // Browser-sync will run on port 3001
    open: false, // Don't auto-open browser
    notify: false // Disable browser-sync notifications
  });
  gulp.watch('./src/scss/**/*.scss', style);
  gulp.watch('./src/pages/**/*.html').on('change', gulp.series(compileHtml, browserSync.reload));
  gulp.watch('./src/js/**/*.js',{cwd:'./'}).on('change', gulp.series(copyJs, browserSync.reload));
  gulp.watch('./src/pages/habits.js',{cwd:'./'}).on('change', gulp.series(copyHabitsPageJs, browserSync.reload));
  gulp.watch('./src/img/**/*.*',{cwd:'./'}).on('change', gulp.series(copyImages, browserSync.reload));
  gulp.watch('./src/sounds/**/*.*',{cwd:'./'}).on('change', gulp.series(copySounds, browserSync.reload));
  // gulp.watch('./src/{layouts,partials}/**/*').on('change', gulp.series(resetPages, compileHtml, browserSync.reload));
}

exports.style = style;
exports.watch = watch;
exports.build = gulp.series(style, compileHtml, copyImages, copyJs, copyHabitsPageJs, copySounds);