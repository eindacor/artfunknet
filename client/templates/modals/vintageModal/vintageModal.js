Template.vintageModal.events({
	'click #vintage-confirm': function() {
		var selected_ids = Session.get('selected_items');
		Meteor.call('vintageMode', selected_ids, function(error){
			if (error) {
				console.log(error.message);
			}

			$('.template-modalTemplate').remove();
		});
	}
})