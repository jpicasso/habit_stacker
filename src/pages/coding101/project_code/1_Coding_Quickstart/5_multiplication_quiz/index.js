
// returns a random number between 1 and 100
var x = Math.floor(Math.random() * 100) + 1;
// returns a random number between 10 and 100 that is a multiple of 10
var y = 10 * (Math.floor(Math.random() * 10) + 1);

// run game
var response = parseInt(prompt('What is ' + x + ' multiplied by ' + y + '?'));
if (response == x * y) {
    alert('you got it right');
} else {
    alert('you got it wrong');
}



