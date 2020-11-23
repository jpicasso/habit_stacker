// 2.1. Lottery App (for loop)
// User picks 4 numbers, 7 numbers are all called ranging from 1-100; Numbers can be used multiple times
//  if user gets 1 number right they win $5, 2 gets $25, 3 gets $525, and 4 gets $275,625


// ***************************************************************************************************************************************************************************

// get the 7 winning lottery numbers
var lottery_nums =[];
for (x = 1; x <= 7; x++) {
    lottery_nums.push(Math.floor(Math.random() * 100) + 1);
}

// use a counter variable to keep track of number of correct picks
var num_correct = 0;

// get user picks one at a time 
for (x = 1; x <= 4; x++) {
    var pick = prompt('pick lottery number ' + x + ' out of 4 picks; number should be between 1 and 100');
    // for each pick, check to see if the lottery pick was right; if it was right, increase score counter
    for (y = 0; y <= 6; y++) {
        if (lottery_nums[y] == pick) {
            num_correct ++;
        } 
    }
}

// print the winnings and correct numbers
alert('you got ' + num_correct + ' winning numbers; you win $' + 5**(2**(num_correct-1)) + '!!');
alert('the correct numbers were:' + lottery_nums);



