// 2.5. Friend Facts (dictionary)
// User is asked what is their friends name, favorite cake type, and birthday, hometown. 
// Then user can type in what they want to know about their friend or enter finish.

// ***************************************************************************************************************************************************************************

var still_playing = true;
var friend = {'name':'', 'cake':'','birthday':'', 'hometown':''};
friend['name'] = prompt('what is your friends name: ');
friend['cake'] = prompt('what is your friends favorite cake: ');
friend['birthday'] = prompt('what is your friends birthday: ');
friend['hometown'] = prompt('what is your friends hometown: ');

while (still_playing == true) {
    var choice = prompt("would you like to know " + friend['name'] + "'s favorite cake, birthday, or hometown?" + 
    "Type cake, birthday or hometown. Type 'done' if you are finished.");
    if (choice == 'done'){
        still_playing = false;
    } else {
        alert(friend[choice]);
    }
    
}