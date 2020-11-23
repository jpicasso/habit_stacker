$(document).ready(function () {
    var total = 0;
    function addValue() {
        event.preventDefault();
        var x = parseFloat($("#amount").val());
        var currency = dollar_format(x);
        $('#items').append(`<tr><td colspan="2">${currency}</td></tr>`);
        total = total + x;
        $('#total').text(dollar_format(total));
        $('#amount').val('');
    }
    
    function dollar_format (num) {
        var x = num.toFixed(2);
        x = "$" + x;
        return x;
    }

    // submit form event
    $('#new_amount').submit(addValue);

})