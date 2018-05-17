Template.vintageModal.events({
	'click #vintage-confirm': function() {
		var selected_ids = getSelectedIds("vintage");

		Meteor.call('vintageMode', getSelectedIds("vintage"), function(error){
			if (error) {
				console.log(error.message);
			}

			Router.go("/dashboard/profile");
			$('.template-modalTemplate').remove();
		});
	}
})