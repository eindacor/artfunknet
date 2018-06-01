Template.sellAllModal.events({
	'click #sell-all-confirm': function() {
		Meteor.call('sellAllUnclaimed', function(error){
			if (error)
				console.log(error);

			else {
				$('.template-modalTemplate').remove();
				updateItemArray();
			}
		})
	}
})