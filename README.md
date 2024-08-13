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

### Deployment
1. delete `dist` folder
2. cd to folder directory in terminal and enter `gulp watch` (automatically pulls up local deployment)
3. Copy / paste new `dist` folder onto your hosting site of choice

### Run locally
1. cd to folder directory in terminal
2. enter `gulp watch` (automatically pulls up local deployment)

### Debugging
Note: if gulp watch function is not working, follow these steps
- go to root directory by pressing `cd` on CLI 
1. $ brew install nvm
2. $ mkdir ~/.nvm
3. $ export NVM_DIR=~/.nvm
4. $ source $(brew --prefix nvm)/nvm.sh
5. $ brew install nvm
6. $ nvm install 14.4.0
7. $ nvm use 14
-	Cd to local folder
8.	Delete node_modules folder
9.	$ npm install
10.	$ gulp watch

### Notes
- Replace "<" with "&lt;": when writing "</script>" in html; this is an exit character


### FAQ
1. How do I preview the site on my local machine? TK
