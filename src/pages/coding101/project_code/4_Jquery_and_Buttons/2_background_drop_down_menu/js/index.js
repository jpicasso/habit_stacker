$(document).ready(function () {
    var backgrounds = ["nyc", "beach", "exchange", "goog", "seinfeld", "ski"];

    for (var i = 0; i < backgrounds.length; i++) {
        $('#background_pick').append('<option>' + backgrounds[i] + '</option>');
    }

   //sets background using pre-made classes
   function setPicture() {
       
    event.preventDefault();       
       var background = $("#background_pick").val();
       $('body').attr('class',background);
    }

    $('form').change(setPicture);    
})

