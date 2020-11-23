// Project 2.6 - Celebrity Greeting

// Create a object constructor called MovieStar 
// MovieStars should take name, birthday, top grossing movie, and spouse
// The object should have a greeting, that greets the user
// Greeting should tell user what celebrity's name is and highest grossing moving
// ***************************************************************************************************************************************************************************


// this creates a new Object Constructor called MovieStar
function MovieStar(name, birthday, top_movie, spouse){
    this.name = name;
    this.birthday = birthday;
    this.top_movie = top_movie;
    this.spouse = spouse;
    this.greeting = function(){
        alert('hi, my name is ' + this.name + '. I am a big star. Have you seen ' + this.top_movie + '? it was great!')
    }
}

// create a new object called tom_cruise using the MovieStar Constructor
var tom_cruise = new MovieStar('Tom Cruise', 'July 3, 1962', 'Mission Impossible: Ghost Protocol', 'single');

// have tom cruise greet the user
tom_cruise.greeting();




