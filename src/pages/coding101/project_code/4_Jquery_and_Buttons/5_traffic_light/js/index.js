
$(document).ready(function() {
    function stop() {
        turnOff();
        $('#stop').css("background-color","red");
    }

    function slow() {
        turnOff();
        $('#slow').css("background-color","yellow");
    }

    function go() {
        turnOff();
        $('#go').css("background-color","green");
    }

    function turnOff() {
        $('#stop').css("background-color","black");
        $('#slow').css("background-color","black");
        $('#go').css("background-color","black");
    }
    
    // Button clicks
    $('#stop-btn').click(stop);
    $('#slow-btn').click(slow);
    $('#go-btn').click(go);
})


