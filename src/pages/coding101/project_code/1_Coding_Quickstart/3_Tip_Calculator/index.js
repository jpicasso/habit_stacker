var check_amount = parseInt(prompt('How much is your bill?'));
var tip_percent = parseInt(prompt('What percent tip would you like to add?', 'just enter the number; no % symbol needed'));
var tip = check_amount * tip_percent / 100;
alert('your tip is ' + tip);
var total = tip + check_amount;
alert('your total bill is ' +  total);