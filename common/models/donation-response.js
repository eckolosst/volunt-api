/* eslint-disable max-len */
'use strict';

var app = require('../../server/server');
const debug = require('debug')('info');

const moment = require('moment');

module.exports = function(DonationResponse) {
  DonationResponse.disableRemoteMethodByName(
    'prototype.__get__donationRequest');
  DonationResponse.disableRemoteMethodByName(
    'prototype.__create__donationRequest');
  DonationResponse.disableRemoteMethodByName(
    'prototype.__delete__donationRequest');
  DonationResponse.disableRemoteMethodByName(
    'prototype.__update__donationRequest');
  DonationResponse.disableRemoteMethodByName(
    'prototype.__destroy__donationRequest');
  DonationResponse.disableRemoteMethodByName(
    'prototype.__findById__donationRequest');
  DonationResponse.disableRemoteMethodByName(
    'prototype.__count__donationRequest');
  DonationResponse.disableRemoteMethodByName(
    'prototype.__createById__donationRequest');
  DonationResponse.disableRemoteMethodByName(
    'prototype.__deleteById__donationRequest');
  DonationResponse.disableRemoteMethodByName(
    'prototype.__updateById__donationRequest');
  DonationResponse.disableRemoteMethodByName(
    'prototype.__destroyById__donationRequest');

  // Desabilitamos el PATCH  Rest de las respuestas de donaciones!
  DonationResponse.disableRemoteMethodByName(
    'prototype.updateAttributes');

//  "creationDate": "2017-12-05T12:01:01.521Z",
//    "amount": 0,
//    "alreadyDelivered": false,
//    "id": "string",
//    "donationRequestId": "string",
//    "donnerId": "string"

  DonationResponse.beforeRemote('create', function(ctx, res, next) {
    var error = new Error();

    // la fecha de creación no se va a mostrar al usuario y
    // debemos colocarle la fecha actual siempre
    ctx.req.body.creationDate = moment();

    // ahora debería verificar que existe el pedido de donación asociado
    // es decir el donation request
    var donationreq = app.models.DonationRequest;
    debug('el donationRequestid que viene es:' + ctx.req.body.donationRequestId);
    donationreq.findById(ctx.req.body.donationRequestId, function(err, donreq) {
      if (err) {
        error.message = 'No se encontró el pedido de donacion';
        error.status = 400;
        next(error);
      } else {
        // se encontro el pedido
        // next();

        // me fijo si el donador existe donnerId esValido
        var donador = app.models.Donner;
        donador.findById(ctx.req.body.donnerId, function(err, donadorrest) {
          if (err) {
            error.message = 'No se encontró el donador';
            error.status = 400;
            next(error);
          } else {
            // se encontro el donador asi que seguimos
            debug('Se encontro el donador');
            // ahora debemos ver que no haya expirado el pedido
            var exp = moment(donreq.expirationDate);
            if (exp.isValid() && exp.isSameOrAfter(moment())) {
              // la fecha de expiracion es igual o mayor a la fecha actual

              if (!donreq.status) {
                // el pedido de donacion ya estaba cerrado...
                // esto pudo haber pasado porque una OS lo cerro unilaterlamente
                // o porque covered fue ya igual a lo donado (ammount)
                error.message = 'El pedido de donación se encuentra cerrado';
                error.status = 404;
                next(error);
              } else {
                // el status es true por lo que el pedido esta abierto todavia

                // solo controlo que la cantidad sea mayor a 0
                // el amount de la respuesta (donationrequest)
                // debe ser mayor a 0.. el productoId
                if (ctx.req.body.amount > 0) {
                  debug('La cantidad es mayor a 0');
                  next();
                } else {
                  error.message = 'La cantidad debe ser mayor a 0';
                  error.status = 404;
                  next(error);
                }
              }// de status
            } else {
              // error porque la fecha de expiracion ya expiro por lo que el
              // pedido ya no es valido
              error.message = 'El pedido de donacion ya no es válido';
              error.status = 404;
              next(error);
            }
          }
        });// de se encontro el donador
      }
    });// de se encontro el pedido
  });

  DonationResponse.afterRemote('create', function(ctx, res, next) {
    var error = new Error();

    // aca debemos primero buscar nuevamente el donationrequest al cual
    // se dono para cambiar el promised y posiblemente el status

    // como ya sabemos que estaria todo bien,
    // lo que tratamos de buscar es todas las instancias necesitadas

    // buscamos las donaciones request
    // var donationreq = app.models.DonationRequest;
    // despues debemos buscar el nombre del producto que se dono
    // var prod = app.models.Product;
    // tambien el email de la organizacion social
    // var org = app.models.Organization;
    // tambien el nombre y apellido del donador
    // var don = app.models.Donner;
    // User.find({include: ['posts', 'orders']}, function() { /* ... */ });

    debug('res tiene:' + res.donationRequestId);

    var donresp = app.models.DonationResponse;

    donresp.find({
      where: {id: res.id},
      include: {
        relation: 'donationRequest',
        scope: {
          include: ['product'],
        },
      },
    },  function(err, resultados) {
      if (err) {
        error.message = 'No encuentra la respuesta a donación.';
        error.status = 400;
        next(error);
      } else {
        resultados.forEach(function(post) {
          var p = post.toJSON();
          debug(p.donationRequest);

          // como no se como recuperar toda la instancia de donner y de organization
          // desde la consulta de arriba,lo hago de a uno...

          // busco el donador que esta en donnerId de res para conseguir
          // su nombre y apellido
          var don = app.models.Donner;
          don.findById(res.donnerId, function(err, donador) {
            if (err) {
              error.message = 'No se encontró el donador';
              error.status = 400;
              next(error);
            } else {
              // se encontro el donador asi que seguimos

              debug('el donador es:' + donador.name + ', ' + donador.lastName);

              // busco tambien el email de la organizacion social
              debug('la OS que viene en el json es: ' + p.donationRequest.organizationId);
              var org = app.models.Organization;
              org.findById(p.donationRequest.organizationId, function(err, organizacion) {
                if (err) {
                  error.message = 'No se encontró la OS que genero el pedido de donacion';
                  error.status = 400;
                  next(error);
                } else {
                  // se encontro la OS del pedido de donacion
                  debug('la OS es: ' + organizacion.email);

                  var cantidadadonar = res.amount;// ya sabiamos que era mayor a 0
                  var cantidadyacubierta = p.donationRequest.covered;

                  // esto se va a realizar solo si el pedido es particular
                  if (!p.donationRequest.isPermanent) {
                    // es un pedido particular
                    // ahora viene toda la parte de controlar las cantidades
                    // con lo que tiene el pedido de donacion....
                    // defini variables nuevas para dar mas semantica...sino no se
                    // entiende nada

                    var cantidadrequerida = p.donationRequest.amount;

                    // promised se modifica siempre...
                    // lo que nose toca es covered, eso lo hace donationrequest
                    // cantidadadonar = res.amount;// ya sabiamos que era mayor a 0

                    var cantidadfaltante = cantidadrequerida - cantidadyacubierta;

                    var cuerpomail = '';

                    if (cantidadadonar >= cantidadfaltante) {
                      // se debe cerrar el pedido ya que se cumplio con lo solicitado
                      // es decir debo poner el status en false
                      // es decir debo poner el status en false
                      // y ademas sumar a cantidadyacubierta + cantidadadonar
                      p.donationRequest.promised = cantidadrequerida;
                      p.donationRequest.status = false;

                      cuerpomail = 'El donador ' + donador.name + ', ' + donador.lastName + ' donó ' +
                        'la cantidad de productos solicitada, por lo que el pedido fue cerrado. Ud' +
                        'puede volver a abrilo en caso que el donador no cumpla con lo pactado';
                    } else {
                      // todavia el pedido queda abierto ya que no se cubrio la
                      // cantidad solicitada
                      p.donationRequest.promised = p.donationRequest.promised + cantidadadonar;

                      cuerpomail = 'El donador ' + donador.name + ', ' + donador.lastName + ' donó ' +
                        'la cantidad de ' + cantidadadonar + ' de productos. El pedido sigue ' +
                        'abierto ya que todavía no se cumplió la cantidad solicitada';
                    }// del else de cantidades
                  } else {
                    // si es permanente
                    // modificamos lo cubierto... no usa promised
                    p.donationRequest.covered = p.donationRequest.covered + cantidadadonar;

                    cuerpomail = 'El donador ' + donador.name + ', ' + donador.lastName + ' donó ' +
                      'la cantidad de ' + cantidadadonar + ' de productos a un pedido permanente ' +
                      'solicitado por Ud';
                  }

                    // ahora debo modificar el donationRequest para que refleje los
                    // cambios en las cantidades y/o status

                 // debug('lo que tengo ahora en el donationrequest es : ' +  p.donationRequest.toString());
                  debug('el mail dice: ' + cuerpomail);
                  var pedido = app.models.DonationRequest;
                  pedido.upsert(p.donationRequest, function(err, resp) {
                    if (err) {
                      error.message = 'No actualizo el pedido de donacion';
                      error.status = 404;
                      next(error);
                    } else {
                      // si funciono todo bien, mando mail
                      debug('funciono, lo que voy a guardar es lo mismo con status : ' +  p.donationRequest.status);
                      let mail = {
                        to: organizacion.email,
                        from: 'Voluntariado <voluntariadouncoma2017@gmail.com>',
                        subject: 'Nueva Respuesta a Pedido de Donación',
                        html: cuerpomail};

                      DonationResponse.app.models.Email.send(mail,
                        function(err) {
                          if (err)
                            throw err;
                          else
                        debug('> sending email to:', organizacion.email);
                        });
                      next();
                    }
                  });// de la actualizacion
                }// del else de la OS
              }); // idem de la OS
            }// del else del donner
          });// del donner
        });// siempre es uno solo? viene del foreach
      };// del else
    });
  });

  DonationResponse.beforeRemote('deleteById',
    function(ctx, res, next) {
      var error = new Error();

      // me fijo que el id del DonationResponse exista
      DonationResponse.findById(ctx.req.params.id, function(err, donationResponse) {
        if (err) {
          error.message = 'No se encontró la respuesta a la donacion';
          error.status = 400;
          next(error);
        } else {
          // si se encontro la respuesta  determino que se puede modificar solo el status.
          if (!donationResponse) {
            error.message = 'No se encontro ningun pedido de donacion con ese id';
            error.status = 404;
            next(error);
          } else {
            // Una vez que ya tengo el donationResponse, le actualizo solo el estado a false.
            donationResponse.status = false;
            donationResponse.save();

            var cuerpomail = 'El donador ' + donationResponse.donner.name + ', ' + donationResponse.donner.lastName + ' canceló ' +
                      'un pedido de donacion que habia realizado a una publicacion de ' + donationResponse.donationRequest.product.name  + ' de su organizacion.';

            let mail = {
              to: donationResponse.donationRequest.organizacion.email,
              from: 'Voluntariado <voluntariadouncoma2017@gmail.com>',
              subject: 'Cancelacion de un Pedido de Donación',
              html: cuerpomail};

            DonationResponse.app.models.Email.send(mail,
              function(err) {
                if (err)
                  throw err;
                else
              console.log('> sending email to:', donationResponse.donationRequest.organizacion.email);
              });

            // retornamos el mensaje de exito.

            ctx.res.send('Eliminacion correcta de la respuesta de donacion');
          }
        }
      });
    });

  DonationResponse.remoteMethod('donationArrival', {
    accepts: [{
      arg: 'id',
      type: 'string',
      required: true,
    },
    {
      arg: 'resId',
      type: 'string',
      required: true,
    }],
    http: {
      'verb': 'GET',
      'path': '/:id/donationArrival',
    },
    returns: {},
  });

  DonationResponse.donationArrival = function(id, cb) {
   // var donresp = app.models.DonationResponse;
    var error = new Error();
    DonationResponse.findOne({
      where: {id: id},
      include: {
        relation: 'donationRequest',
      },
    }, function(err, resultados) {
      if (err) {
        error.message = 'No se encuentra la respuesta a donacion';
        error.status = 400;
        cb(error);
      } else {
        console.log('resultados tiene:', resultados);
        // es true con nulo, undefined, false y 0
        if (resultados.length === 0) {
          error.message = 'No existe la respuesta a donacion ';
          error.status = 400;
          cb(error);
        } else {
          // resultados.forEach(function(post) {
          var p = resultados.toJSON();
          // aca debo pasar de el ispending a false en donationresponse y
          // en donation request debo restar del promised y sumar al covered

          resultados.ispending = false;
          resultados.donationRequest.promised = p.donationRequest.promised - p.amount;
          resultados.donationRequest.covered = p.donationRequest.promised + p.amount;

          resultados.save();
          cb(resultados);
        }
      }
    });// del function y find
  };

  /*     DonationRequest.findOne({where: {email: mail}}, function(err, Donner) {
          if (err) throw err;
          console.log(Donner);
          cb(null, Donner != null);
        });
      }; */
};

