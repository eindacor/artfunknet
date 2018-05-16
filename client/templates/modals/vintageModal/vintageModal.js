Template.vintageModal.events({
	'click #vintage-confirm': function() {
		var selected_ids = Session.get('selected_items');

		Meteor.call('vintageMode', selected_ids, function(error){
			if (error) {
				console.log(error.message);
			}

			Router.go("/dashboard/profile");
			$('.template-modalTemplate').remove();
		});
	}
})