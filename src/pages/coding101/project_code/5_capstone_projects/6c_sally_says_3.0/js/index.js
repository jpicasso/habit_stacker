$(document).ready(function () {
    event.preventDefault();
    
    var score = 0;
    var pattern = '';
    var answer = '';
    var i = 0;

    // starts game by initializing sequence with 1 color
    function start_game(){
        pattern = '';
        pattern = get_rand_color();
        i = 0;
        bob_presses();
    }
    
    // uses a random number and switch statement to generate a random color 
    function get_rand_color() {
        // create a random number between 1 and 4;
        var x = Math.floor((Math.random()*4)+1);
        // convert the number to one of the four colors
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

    function bob_presses() {
        // reset colors
        $('#red').css({'background-color':'rgba(255,0,0,1)'});
        $('#blue').css({'background-color':'rgba(0,0,255,1)'});
        $('#yellow').css({'background-color':'rgba(255,255,0,1)'});
        $('#green').css({'background-color':'rgba(0,255,0,1)'});

        if (i < pattern.length) {
            show_button_press(pattern[i]);
            play_audio(pattern[i]);
            i++;
            setTimeout(bob_presses, 1000);
        }         
    }
    
    function show_button_press(color) {
        switch (color){
            case 'r':
                $('#red').css({'background-color':'rgba(255,0,0,0.5)'});
                break; 
            case 'b':
                $('#blue').css({'background-color':'rgba(0,0,255,0.5)'});
                break; 
            case 'y':
                $('#yellow').css({'background-color':'rgba(255,255,0,0.5)'});
                break; 
            case 'g':
                $('#green').css({'background-color':'rgba(0,255,0,0.5)'});
                break; 
        }
    }

    function play_audio(color) {
        switch (color){
            case 'r':
                var x = document.getElementById("r_audio");
                break; 
            case 'g':
                var x = document.getElementById("g_audio"); 
                break; 
            case 'b':
                var x = document.getElementById("b_audio"); 
                break; 
            case 'y':
                var x = document.getElementById("y_audio"); 
                break; 
        }
        x.play();
    }

    // Play game tells user color sequence and gets user to repeat it.
    // If answer is correct, then recursively plays again with an additional color
    // If wrong, game ends
    function play_game() {
        if (answer == pattern) {
            alert('that was correct!');
            score ++;
            answer = '';
            pattern = pattern + get_rand_color();
        } else {
            alert('that was wrong. the correct answer was: ' + pattern + '. You got ' + score + ' correct.');
            score = 0;
            pattern = '';
            answer = '';
        }
        i = 0;
        bob_presses();
    } 


    // color_pressed function adds color to answer until answer is as long as Bob's pattern, then runs play game
    function color_pressed(event){
        var color = event.data.color;
        play_audio(color);
        answer = answer + color;
        if (answer.length == pattern.length){
            play_game();
        } else if ( answer.length > pattern.length) {
            answer = '';
            alert('press play game to start the game');
        }   
    }

    // Button call function to start game
    $('#start_game').click(start_game);
    // Colored buttons run color_pressed function and pass along data with color pressed
    $('#red').click({color:"r"}, color_pressed);
    $('#yellow').click({color:"y"}, color_pressed);
    $('#green').click({color:"g"}, color_pressed);
    $('#blue').click({color:"b"}, color_pressed);
})