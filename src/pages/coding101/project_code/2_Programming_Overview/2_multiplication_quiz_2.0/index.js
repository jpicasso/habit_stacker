//  Multiplication Quiz 3.0 

// Create a math quiz that asks the user to multiply two random numbers together
// If the user gets the right answer, then alert the user that they got it right, otherwise alert them that they got it wrong
// Make the first random number an integer between 1 and 100 and the second random number an integer between 10 and 100 that is a multiple of 10!
// User continues to play game until they get one wrong
// Program then tells user number that they got correct

// ***************************************************************************************************************************************************************************

// global variables
var still_playing = true;
var score = 0;

// while loop runs game until user gets one wrong
while (still_playing == true) {
    // returns a random number between 1 and 100
    x = Math.floor(Math.random() * 100) + 1
    // returns a random number between 10 and 100 that is a multiple of 10
    y = 10 * (Math.floor(Math.random() * 10) + 1)
     
    // give user two numbers and get their response
    var response = parseInt(prompt('What is ' + x + ' multiplied by ' + y + '?'));

    // if response is correct, increase their score; otherwise end game
    if (response == x * y) {
        score += 1;
    } else {
        still_playing = false;
    }
}

// once game is over, tell user how many they got correct
alert('you got ' + score + ' correct');


