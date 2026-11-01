#pragma once

#include "carfleet/location/v1/location_service.grpc.pb.h"

namespace carfleet::location {

// Implements carfleet.location.v1.LocationService. Methods not yet
// overridden fall through to the generated base class, which returns
// UNIMPLEMENTED.
class LocationServiceImpl final : public v1::LocationService::Service {};

}  // namespace carfleet::location
