Template.createAuctionModal.events ({
	'click #ok-modal': function(element, template) {
		var item_id = Session.get('selectedItem');
		var starting = getAmountFromInput(template.find('#starting-amount').value);

		var buy_now = getAmountFromInput(template.find('#buy-now-amount').value);
		buy_now = buy_now == "" ? -1 : buy_now;

		var duration = template.find('#duration').value;
		
    	Meteor.call('auctionArtwork', item_id, Number(starting), Number(buy_now), duration, function(error, error_list) {
			if (error)
				console.log(error.message);

			else if (error_list.length > 0) {
				Session.set('createAuctionErrors', error_list);
				$('.errors').show();
			}

			else {
				Session.set('createAuctionErrors', []);
				$('.errors').hide();
				Modal.hide("createAuctionModal");
			}
		}); 
    },

    'click #cancel-modal' : function(event, template) {
    	Modal.hide("createAuctionModal");
    },
})

Template.createAuctionModal.helpers({
	'itemData' : function() {
		var item_object = items.findOne(Session.get('selectedItem'));
		if (!!item_object) {
			return {
				'item_id' : item_object._id,
				'title' : item_object.artwork_data.title,
				'artist' : item_object.artwork_data.artist,
			}
		}

		else return {
			'title' : "",
			'artist' : "",
			'buy_now' : "",
			'balance' : ""
		}
	},

	'error' : function() {
		return Session.get('createAuctionErrors');
	}
})