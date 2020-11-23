# Park22 - UpriseU
## Static templates
### Installation and Development

Install `gulp-cli` globally, `npm install` from the document root, then run `gulp watch`. Combines and processes SCSS and watches for changes to all .scss, .js and .html files.

You’ll need to run `npm update` and then `npm install panini` to download the panini  plugin


### Folder Structure
- src - Holds all working files 
- dist - What you upload to web server. This folder is .gitignored since everything in it is generated from src
- src/layouts/default - basic HTML wrapper used on all pages. {{> body}} is where the content from src/pages is filled in
    - there are a few example partials so you can see how it works. Notably, each page loads a partial called navbar with the syntax {{> navbar}}
- At the top of the pages, you can set layout variables. I’ve set a title in each one that will feed into layouts/default.html and become the title in <head>
- gulpfile has a lot of comments so you can see how things work

### SCSS Structure

- Main scss file in `scss/main.scss`
- View Bootstrap's editable variables in `scss/bootstrap/_variables.scss`
- Override variables in `scss/_variables-override.scss`



### Tech Stack Overview
- Gulp
- Panini - Plugin for Gulp that allows you to make basic templates using layouts, pages, partials and variables


### Notes
- Replace "<" with "&lt;": when writing "</script>" in html; this is an exit character