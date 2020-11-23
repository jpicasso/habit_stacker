$(document).ready(function () {
    event.preventDefault();
    
    var score = 3;
    var pattern = '';
    var answer = '';

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
        if (answer == ''){
            alert('memorize these colors: ' + pattern);
        } else if (answer.length == pattern.length) {
            if (answer == pattern) {
                alert('that was correct!');
                score ++;
                answer = '';
                pattern = pattern + get_color();
                play_game();   
            } else {
                alert('that was wrong. the correct answer was: ' + pattern + '. You got ' + score + ' correct.');
                score = 4;
                pattern = '';
            }
        } 
    } 

    function color_pressed(event){
        answer = answer + event.data.color;
        if (answer.length == pattern.length){
            play_game(answer);
        }   
    }

    // Button call function to start game
    $('#start_game').click(start_game);
    $('#red').click({color:"r"}, color_pressed);
    $('#yellow').click({color:"y"}, color_pressed);
    $('#green').click({color:"g"}, color_pressed);
    $('#blue').click({color:"b"}, color_pressed);

})