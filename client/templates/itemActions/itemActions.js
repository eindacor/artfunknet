var template_rendered_tracker = new Tracker.Dependency;
var rendered;

Template.itemActions.helpers({
	'setActions': function(item_object) {
		template_rendered_tracker.depend();
		if (rendered) {
			var div_id = item_object._id + "_actions";
			var player_interface = new PlayerIF(Meteor.user());
			var item_interface = new ItemIF(item_object);
			var dom_element = getItemActionsHTML(new PlayerItemIF(player_interface, item_interface));
			$('#' + div_id).empty().append(dom_element);
		}	
	}
})

Template.itemActions.rendered = function() {
	rendered = true;
	template_rendered_tracker.changed();
}