var item_id = 0;
function add_item() {
    var new_item = prompt('Enter item');
    item_id ++;
    $('#groceries').append("<li id='" + item_id + "'>" + new_item + "<button class='del_btn' value='" + item_id + "'> delete </button> </li>");
}

function delete_item(){
    var id = $(this).val();
    var line = '#' + id;
    $(line).remove();
}

// calls function when button is clicked
$('#add_btn').click(add_item);
// since html is being added with JQuery after DOM loads, need to use below format
$('#groceries').on('click', '.del_btn', delete_item);
