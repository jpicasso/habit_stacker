// 2.8. Celebrity trivia

// This is similar to the Friends Fact project except you will have 3 celebrities that are already populated with information 
// Create a “MovieStar” object to store each celebrities data 
// Put each stars into a single list
// User is asked 3 random questions  about the celebrity
// ***************************************************************************************************************************************************************************


// this creates a new class called MovieStar
function MovieStar(name, birthday, top_movie, spouse){
    this.name = name;
    this.birthday = birthday;
    this.top_movie = top_movie;
    this.spouse = spouse;
}

// create movie star data
var star_list = [];
var tom_cruise = new MovieStar('Tom Cruise', 'July 3, 1962', 'Mission Impossible: Ghost Protocol ($695M)', 'single');
star_list.push(tom_cruise);

var dwayne_johnson = new MovieStar('Dwayne Johnson', 'May 2, 1972', 'Furious 7 ($1,500M)', 'Lauren Hashian');
star_list.push(dwayne_johnson);

var scarlett_johansson = new MovieStar('Scarlett Johansson', 'November 22, 1984', 'Avengers: End Game ($858M)', 'single');
star_list.push(scarlett_johansson);


// set up game play
var round_num = 1;
var score = 0;

while (round_num <= 3 ) {
    // random numbers between 0 and 2; x will be used for the celebrity; y will be used for the question asked
    x = Math.floor(Math.random() * 3);
    y = Math.floor(Math.random() * 3);

    if (y == 0){
        var response = prompt("What is " + star_list[x].name + "'s birthday? Enter month then the day followed by a comma and the year");
        if (response == star_list[x].birthday){
            score ++;
            alert('that was correct!');
        } else {
            alert('that was incorrect! The correct answer was ' + star_list[x].birthday);
        }
    } else if (y == 1) {
        var response = prompt("What is " + star_list[x].name + "'s top grossing movie? Enter movie name and dollar in following format "+
        "'Gone with the Wind ($1,810M)'");
        if (response == star_list[x].top_movie){
            score ++;
            alert('that was correct!');
        } else {
            alert('that was incorrect! The correct answer was ' + star_list[x].top_movie);
        }
    } else {
        var response = prompt("What is " + star_list[x].name + "'s current spouse? Enter 'single' if they don't have one");
        if (response == star_list[x].spouse){
            score ++;
            alert('that was correct!');
        } else {
            alert('that was incorrect! The correct answer was ' + star_list[x].spouse);
        }
    }
    round_num ++;
}

alert('you got ' +score + ' out of 3 correct');

