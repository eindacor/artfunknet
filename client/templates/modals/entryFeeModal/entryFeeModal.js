Template.entryFeeModal.events({
	'click #ok-modal': function(event, template) {
		var fee_selected = $('#entry-fee').val();
		Meteor.call('updateEntryFee', fee_selected, function(error) {
			if (error)
				console.log(error)

			Modal.hide("entryFeeModal");
		});
    },

    'click #cancel-modal' : function(event, template) {
    	Modal.hide("entryFeeModal");
    },
})