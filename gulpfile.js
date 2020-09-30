const gulp = require('gulp');
const sass = require('gulp-sass');
const browserSync = require('browser-sync').create();

// Combine and process SCSS
function style() {
  return gulp.src('scss/main.scss')
  .pipe(sass(
    {outputStyle: 'compressed'} // minify CSS
  ).on('error',sass.logError))
  .pipe(gulp.dest('css'))
  .pipe(browserSync.stream());
}

// Watch for changes to all project files
function watch() {
  browserSync.init({
    server: {
      baseDir: "./",
      index: "/index.html"
    }
  });
  gulp.watch('scss/**/*.scss', style)
  gulp.watch('html/*.html').on('change',browserSync.reload);
  gulp.watch('./js/**/*.js').on('change', browserSync.reload);
}

exports.style = style;
exports.watch = watch;