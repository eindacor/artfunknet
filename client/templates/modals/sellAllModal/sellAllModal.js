Template.sellAllModal.events({
	'click #sell-all-confirm': function() {
		Meteor.call('sellAllUnclaimed', function(error){
			if (error)
				console.log(error.message);

			$('.template-modalTemplate').remove();
		})
	}
})