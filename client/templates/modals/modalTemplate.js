Template.modalTemplate.helpers({
	'modalData' : function(modal_data) {
		console.log(modal_data);
	}
})

Template.modalTemplate.events({
	'click .close-button': function() {
		$('.template-modalTemplate').remove();
	}
})

Template.modalTemplate.rendered = function() {
	$(document).on('keyup', function(event) {
		if (event.keyCode == 27)
			$('.template-modalTemplate').remove();
	})
}