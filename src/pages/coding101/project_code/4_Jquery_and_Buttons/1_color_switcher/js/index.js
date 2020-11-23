function color_switcher() {
    var color = $('input').val(); 
    $('body').css("background-color",color);
}

// calls function when button is clicked
$('button').click(color_switcher);
