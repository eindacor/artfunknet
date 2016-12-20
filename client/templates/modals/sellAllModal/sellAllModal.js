Template.sellAllModal.events({
	'click #sell-all-confirm': function() {
		Meteor.call('sellAllUnclaimed', function(error){
			if (error)
				console.log(error.message);

			else {
				$('.template-modalTemplate').remove();
				Session.set('update_set', true);
			}
		})
	}
})