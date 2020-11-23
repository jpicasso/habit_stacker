$(document).ready(function () {
    event.preventDefault();
    
    var score = 3;
    var pattern = '';

    // starts game by initializing sequence with 3 colors
    function start_game(){
        pattern = '';
        pattern = get_color() + get_color() + get_color();
        play_game(); 
    }
    
    // uses a random number and switch statement to generate a random color 
    function get_color() {
        // create a random number between 1 and 4;
        var x = Math.floor((Math.random()*4)+1);

        // conver the number to one of the four colors
        switch (x){
            case 1:
                return 'r';
            case 2:
                return 'g';
            case 3:
                return 'b';
            case 4:
                return 'y';
        }
    }

    // Play game tells user color sequence and gets user to repeat it.
    // If answer is correct, then recursively plays again with an additional color
    // If wrong, game ends
    function play_game() {
        alert('memorize these colors: ' + pattern);
        var answer = prompt('Type in the colors. rgbyr for red, green, blue, yellow, red.')
        if (answer == pattern) {
            alert('that was correct!');
            score ++;
            pattern = pattern + get_color();
            play_game();   
        } else {
            alert('that was wrong. the correct answer was: ' + pattern + '. You got ' + score + ' correct.');
            score = 4;
        }
    }    

    // Button call function to start game
    $('#start_game').click(start_game);

})