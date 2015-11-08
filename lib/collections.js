alerts = new Mongo.Collection("alerts");
artists = new Mongo.Collection("artists");
artworks = new Mongo.Collection("artworks");
attributes = new Mongo.Collection("attributes");
auctions = new Mongo.Collection("auctions");
items = new Mongo.Collection("items");
npcs = new Mongo.Collection("npcs");
galleries = new Mongo.Collection("galleries");
gallery_finishes = new Mongo.Collection("gallery_finishes");

if (Meteor.isServer) {
    Meteor.publish("alerts", function() {
        return alerts.find({"user_id": this.userId});
    });

    Meteor.publish("artists", function() {
        return artists.find({});
    });

    Meteor.publish("artworks", function() {
        return artworks.find({});
    });

    Meteor.publish("attributes", function() {
        return attributes.find({});
    });

    Meteor.publish("auctions", function() {
        return auctions.find({});
    });

    Meteor.publish("items", function() {
        return items.find({});
    });

    Meteor.publish("npcs", function() {
        return npcs.find({});
    });

    Meteor.publish("galleries", function() {
        return galleries.find({});
    });

    Meteor.publish("gallery_finishes", function() {
        return gallery_finishes.find({});
    });
}

if (Meteor.isClient) {
    Meteor.subscribe("alerts");
    Meteor.subscribe("artists");
    Meteor.subscribe("artworks");
    Meteor.subscribe("attributes");
    Meteor.subscribe("auctions");
    Meteor.subscribe("items");
    Meteor.subscribe("npcs");
    Meteor.subscribe("galleries");
    Meteor.subscribe("gallery_finishes");
}

artworkImages = new FS.Collection("artworkImages", { stores: [new FS.Store.FileSystem("artworkImages")] });
profilePhotos = new FS.Collection("profilePhotos", { stores: [new FS.Store.FileSystem("profilePhotos")] });

Meteor.users.deny({
  update: function() {
    return true;
  }
});