var display_details_dep = new Tracker.Dependency;

var display_details = {};

Template.onDisplayModal.rendered = function() {
	Session.set('onDisplayErrors', []);
	var item_id = Session.get('selectedItem');
    refreshDisplayDetails(item_id, $('#duration').val());
};

var refreshDisplayDetails = function(item_id, duration) {
	Meteor.call('getDisplayDetails', item_id, duration, function(error, result) {
		if (error)
			console.log(error.message);

		else {
			display_details = {
				'money' : getCommaSeparatedValue(result.money),
				'xp' : getCommaSeparatedValue(result.xp),
				'end' : getTimeString(moment(result.end))
			};
			display_details_dep.changed();
		}
	})
}

Template.onDisplayModal.events ({
	'click #ok-modal': function(event, template) {
		Meteor.call('displayArtwork', Session.get('selectedItem'), $('#duration').val(), function(error, error_list) {
			if (error)
				console.log(error.message);

			else if (error_list.length > 0) {
				Session.set('onDisplayErrors', error_list);
				$('.errors').show();
			}

			else {
				Session.set('onDisplayErrors', []);
				$('.errors').hide();
				Modal.hide("onDisplayModal");

				if (Meteor.user().profile.tutorials.gallery && 
					items.findOne({'owner': Meteor.userId(), 'status': "displayed"}) && 
					items.findOne({'owner': Meteor.userId(), 'status': "permanent"})) 
				{
					Blaze.renderWithData(Template.modalTemplate, {
						'modal_name': "tutorialModal", 
						'modal_data': {
							'tutorial_name': "gallery",
							'next': undefined,
							'activate': "my_gallery",
							'image_filename': "tutorial/menu_gallery.png",
							'message': "Now that you have an item on display, and an item in your permanent collection, you can see your items in your gallery. Go there when you're ready, by clicking the 'My Gallery' button in the menu."
						}
					}, $('body')[0]);
				};

				Session.set('item_to_update', items.findOne(Session.get('selectedItem')));
			}
		});			
    },

    'click #cancel-modal' : function(event, template) {
    	Modal.hide("onDisplayModal");
    },

    'change #duration' : function(event) {
    	var item_id = Session.get('selectedItem');
    	refreshDisplayDetails(item_id, $(event.target).val());
    }
})

Template.onDisplayModal.helpers({
	'itemData' : function() {
		var item_object = items.findOne(Session.get('selectedItem'));
		if (!!item_object) {
			return {
				'item_id' : item_object._id,
				'title' : item_object.artwork_data.title,
				'artist' : item_object.artwork_data.artist
			}
		}

		else return {
			'item_id' : "",
			'title' : "",
			'artist' : "",
		}
	},

	'error' : function() {
		return Session.get('onDisplayErrors');
	},

	'display_duration' : function() {
		return $('#duration').val();
	},

	'displayDetails' : function() {
		display_details_dep.depend();
		return display_details;
	}
})