Template.vintageModal.events({
	'click #vintage-confirm': function() {
		Meteor.call('vintageMode', function(error){
			if (error)
				console.log(error.message);

			$('.template-modalTemplate').remove();
		});
	}
})