// global variables
var still_playing = true;
var dice1 = 1;
var dice2 = 1;
var chips = 100;
var bet = 0;
var total = 0;

// roll dice
function roll_dice(){
    dice1 = Math.floor(Math.random()*6 + 1);
    dice2 = Math.floor(Math.random()*6 + 1);
    total = dice1 + dice2;
    alert('dice 1 was ' + dice1 + '; dice 2 was ' + dice2 + ' total was '+total);
}

// take user bet
function take_bet(){
    bet = parseInt(prompt('How much would you like to bet? You have $'+chips));
    if (bet> chips){
        alert("you dont have that much money");
        take_bet();
    }
}

// run game
while (still_playing){
    take_bet();
    roll_dice();
    if (total == 7){
        chips = chips + bet;
        alert('you won! you now have $' +chips);
    } else {
        chips = chips - bet;
        alert('you lost! you now have $' +chips);
    }
    if (chips <=0) {
        alert('you are out of money. We will give you one more chance because we like you. If you roll a 12 we will give you $10');
        roll_dice();
        if (total == 12) {
            alert('you won $10');
            chips = chips + 10;
        } else {
            alert('you lost!');
            still_playing = false;
        }
    } else {
        var response = prompt("type 'y' if you want to play again. otherwise type 'n'");
        if (response == 'n') {
            still_playing = false;
        }
    }
}