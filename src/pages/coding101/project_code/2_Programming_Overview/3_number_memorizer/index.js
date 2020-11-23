// 2.3. # Memorizer 

// User is given a random 4 digit number
// they must memorize it, press ok, and then re-enter it
// if user gets it right, user plays again with 5 digits, then 6, then 7...
// ...until user gets one wrong 

// ***************************************************************************************************************************************************************************


// set up global variables
var still_playing = true;
var x = 4;

// have user continue to play until game ends
while (still_playing == true) {  
    // when x is 4, want to get a random number between 1000 and 9999; this is complicated
    var new_num = Math.floor((Math.random() * (10**x-10**(x-1)) + 10**(x-1)));
    
    // tell user number and then get their response
    alert('memorize this number: ' + new_num);
    var answer = prompt('type in the number');
    // check if answer is correct; if right, increasee # of digits, if wrong end game
    if (new_num == answer) {
        alert('that was correct! Good job! That was ' + x + ' digits!!');
    } else {
        alert('that was wrong; the number was ' + new_num);
        still_playing = false;
    }
    x++;
}
