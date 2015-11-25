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