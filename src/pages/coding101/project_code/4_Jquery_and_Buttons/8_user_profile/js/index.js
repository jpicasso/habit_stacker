$(document).ready(function () {
    
    // create location drop down menu options
    var location = ["NYC", "Bay Area", "Denver", "Austin", "Atlanta"];
    for (var i = 0; i < 5; i++) {
        $('#location').append('<option>' + location[i] + '</option>');
    }
    
    var interests = ["Product Management", "Engineering", "Finance", "Biz Dev"];
    // create checkboxes
    for (i = 0; i < interests.length; i++) {
        $('#interests').append("<label class='CheckBoxContainer'> " + interests[i] + "<input type='checkbox' name='categories' value='" + interests[i] + "'> <span class='checkmark'></span></label>");
    }

    // submit profile data by saving to local storage and redirecting to profile page
    function submit_profile(){
        var first_name = $('#first_name').val();
        var last_name = $('#last_name').val();
        //loops through each checkbox to see if selected
        var interests = document.forms[0];
        var selected_interests = [];
        for (i = 0; i < interests.length; i++) {
            if (interests[i].checked) {
                selected_interests.push(interests[i].value);
            }
        }
        
        localStorage.setItem("first_name",first_name);
        localStorage.setItem("last_name",last_name);
        localStorage.setItem("cell",$('#cell').val());
        localStorage.setItem("email",$('#email').val());
        localStorage.setItem("mentor",$('#mentor').val());
        localStorage.setItem("location",$('#location').val());
        localStorage.setItem("selected_interests",selected_interests);
        localStorage.setItem("notes",$('#notes').val());
        
        window.location.href = "profile.html";
    }

    // button click functions
    $('#submit').click(submit_profile);

    function load_profile(){
        var first_name = localStorage.getItem("first_name");
        var last_name = localStorage.getItem("last_name");
        $('#user_name').html(first_name + ' ' + last_name);
        $('#user_cell').html(localStorage.getItem("cell"));
        $('#user_email').html(localStorage.getItem("email"));
        $('#user_mentor').html(localStorage.getItem("mentor"));
        $('#user_location').html(localStorage.getItem("location"));
        $('#user_interests').html(localStorage.getItem("selected_interests"));
        $('#user_notes').html(localStorage.getItem("notes"));
    }    
    load_profile();
})